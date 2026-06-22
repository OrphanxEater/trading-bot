const logger = require('../utils/logger');

/**
 * POSITION MANAGER
 *
 * Manages all open trading positions:
 * 1. Track entry, current P&L, and risk metrics
 * 2. Monitor stop-loss and take-profit triggers
 * 3. Implement trailing stops
 * 4. Detect regime changes requiring exit
 * 5. Handle partial exits and scaling
 * 6. Emergency exit on manipulation detection
 *
 * This is the "traffic controller" for all active trades.
 */

class PositionManager {
  constructor(config) {
    this.config = config;

    // All open positions
    this.positions = new Map(); // positionId -> position data

    // Position limits
    this.limits = {
      maxConcurrent: config.maxConcurrent || 5,
      maxPerToken: config.maxPerToken || 1,
      maxPortfolioRisk: config.maxPortfolioRisk || 0.10 // 10% total portfolio risk
    };

    // Monitoring intervals
    this.monitoringInterval = null;
    this.monitorFrequency = config.monitorFrequency || 5000; // Check every 5 seconds

    logger.info('Position Manager initialized', {
      maxConcurrent: this.limits.maxConcurrent,
      monitorFrequency: `${this.monitorFrequency / 1000}s`
    });
  }

  /**
   * Open a new position
   */
  async openPosition(executionPlan, executionResult) {
    try {
      // Generate position ID
      const positionId = this.generatePositionId();

      const position = {
        id: positionId,
        token: executionPlan.token,
        direction: executionPlan.direction,

        // Entry details
        entryTime: Date.now(),
        entryPrice: executionResult.executionPrice,
        size: executionPlan.positionSize,
        tokenAmount: executionPlan.tokenAmount,

        // Risk parameters
        stopLoss: executionPlan.stopLoss,
        takeProfit: executionPlan.takeProfit,
        maxLoss: executionPlan.riskParameters.maxLoss,
        riskReward: executionPlan.riskParameters.riskReward,

        // Strategy info
        strategy: executionPlan.strategy || 'MANUAL',
        timeframe: executionPlan.timeframe || '1h',
        confidence: executionResult.confidence || 70,

        // Current state
        status: 'OPEN',
        currentPrice: executionResult.executionPrice,
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,

        // Trailing stop
        trailingStopEnabled: this.config.enableTrailingStop || false,
        trailingStopPercent: this.config.trailingStopPercent || 0.05, // 5%
        highestPrice: executionResult.executionPrice,
        lowestPrice: executionResult.executionPrice,

        // Partial exit tracking
        partialExits: [],
        remainingSize: executionPlan.positionSize,

        // Transaction details
        entryTxSignature: executionResult.txSignature,
        entrySlippage: executionResult.slippage,
        entryCosts: executionResult.costs,

        // Metadata
        createdAt: Date.now(),
        lastUpdated: Date.now()
      };

      this.positions.set(positionId, position);

      logger.success('Position opened', {
        id: positionId,
        token: position.token,
        direction: position.direction,
        size: `$${position.size.toFixed(2)}`,
        entry: position.entryPrice.toFixed(4)
      });

      // Start monitoring if not already running
      if (!this.monitoringInterval) {
        this.startMonitoring();
      }

      return position;

    } catch (error) {
      logger.error('Failed to open position:', error);
      throw error;
    }
  }

  /**
   * Update position with current market price
   */
  async updatePosition(positionId, currentPrice) {
    const position = this.positions.get(positionId);
    if (!position) {
      logger.warn('Position not found:', positionId);
      return null;
    }

    // Update price
    position.currentPrice = currentPrice;
    position.lastUpdated = Date.now();

    // Calculate P&L
    if (position.direction === 'LONG') {
      position.unrealizedPnL = (currentPrice - position.entryPrice) * position.tokenAmount;
      position.unrealizedPnLPercent = (currentPrice - position.entryPrice) / position.entryPrice;
    } else {
      position.unrealizedPnL = (position.entryPrice - currentPrice) * position.tokenAmount;
      position.unrealizedPnLPercent = (position.entryPrice - currentPrice) / position.entryPrice;
    }

    // Track highest/lowest for trailing stops
    if (currentPrice > position.highestPrice) {
      position.highestPrice = currentPrice;
    }
    if (currentPrice < position.lowestPrice) {
      position.lowestPrice = currentPrice;
    }

    // Check exit conditions
    const exitSignal = await this.checkExitConditions(position);
    if (exitSignal) {
      return { position, exitSignal };
    }

    return { position, exitSignal: null };
  }

  /**
   * Check if position should be exited
   */
  async checkExitConditions(position) {
    const signals = [];

    // 1. Stop Loss Check
    if (this.shouldStopLoss(position)) {
      signals.push({
        type: 'STOP_LOSS',
        reason: `Price hit stop loss at ${position.stopLoss.toFixed(4)}`,
        urgency: 'IMMEDIATE',
        exitPercent: 1.0 // Exit 100%
      });
    }

    // 2. Take Profit Check
    if (this.shouldTakeProfit(position)) {
      signals.push({
        type: 'TAKE_PROFIT',
        reason: `Price reached target at ${position.takeProfit.toFixed(4)}`,
        urgency: 'IMMEDIATE',
        exitPercent: 0.5 // Exit 50%, let rest run with trailing stop
      });
    }

    // 3. Trailing Stop Check
    if (position.trailingStopEnabled && this.shouldTrailingStop(position)) {
      signals.push({
        type: 'TRAILING_STOP',
        reason: `Trailing stop triggered from peak at ${position.highestPrice.toFixed(4)}`,
        urgency: 'IMMEDIATE',
        exitPercent: 1.0
      });
    }

    // 4. Time-Based Exit
    const timeInPosition = Date.now() - position.entryTime;
    const maxDuration = this.getMaxDuration(position.timeframe);
    if (timeInPosition > maxDuration) {
      signals.push({
        type: 'TIME_LIMIT',
        reason: `Position held for ${(timeInPosition / 3600000).toFixed(1)} hours`,
        urgency: 'NORMAL',
        exitPercent: 1.0
      });
    }

    // 5. Max Loss Limit
    if (position.unrealizedPnL < -position.maxLoss) {
      signals.push({
        type: 'MAX_LOSS',
        reason: `Loss exceeded maximum: $${Math.abs(position.unrealizedPnL).toFixed(2)}`,
        urgency: 'IMMEDIATE',
        exitPercent: 1.0
      });
    }

    // Return highest priority signal
    if (signals.length > 0) {
      // Sort by urgency
      signals.sort((a, b) => {
        const urgencyOrder = { 'IMMEDIATE': 0, 'NORMAL': 1, 'PATIENT': 2 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      });

      return signals[0];
    }

    return null;
  }

  /**
   * Check if stop loss should trigger
   */
  shouldStopLoss(position) {
    if (position.direction === 'LONG') {
      return position.currentPrice <= position.stopLoss;
    } else {
      return position.currentPrice >= position.stopLoss;
    }
  }

  /**
   * Check if take profit should trigger
   */
  shouldTakeProfit(position) {
    if (position.direction === 'LONG') {
      return position.currentPrice >= position.takeProfit;
    } else {
      return position.currentPrice <= position.takeProfit;
    }
  }

  /**
   * Check if trailing stop should trigger
   */
  shouldTrailingStop(position) {
    if (position.direction === 'LONG') {
      const dropFromPeak = (position.highestPrice - position.currentPrice) / position.highestPrice;
      return dropFromPeak >= position.trailingStopPercent;
    } else {
      const riseFromLow = (position.currentPrice - position.lowestPrice) / position.lowestPrice;
      return riseFromLow >= position.trailingStopPercent;
    }
  }

  /**
   * Get maximum duration for timeframe
   */
  getMaxDuration(timeframe) {
    const durations = {
      '15m': 3600000,      // 1 hour
      '1h': 14400000,      // 4 hours
      '4h': 86400000,      // 1 day
      '1d': 604800000      // 1 week
    };

    return durations[timeframe] || 86400000; // Default 1 day
  }

  /**
   * Close position (full or partial)
   */
  async closePosition(positionId, exitPercent = 1.0, exitReason = 'MANUAL') {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    const exitSize = position.remainingSize * exitPercent;

    logger.info('Closing position', {
      id: positionId,
      token: position.token,
      exitPercent: `${(exitPercent * 100).toFixed(0)}%`,
      reason: exitReason,
      pnl: `$${position.unrealizedPnL.toFixed(2)}`
    });

    const exit = {
      exitTime: Date.now(),
      exitPrice: position.currentPrice,
      exitSize: exitSize,
      exitPercent: exitPercent,
      exitReason: exitReason,
      pnl: position.unrealizedPnL * exitPercent,
      pnlPercent: position.unrealizedPnLPercent,
      duration: Date.now() - position.entryTime
    };

    // Record partial exit
    position.partialExits.push(exit);
    position.remainingSize -= exitSize;

    // If fully closed
    if (position.remainingSize < 0.01 || exitPercent >= 0.99) {
      position.status = 'CLOSED';
      position.closedAt = Date.now();

      // Calculate total P&L
      const totalPnL = position.partialExits.reduce((sum, e) => sum + e.pnl, 0);
      position.totalPnL = totalPnL;
      position.totalPnLPercent = (totalPnL / position.size) * 100;

      logger.success('Position fully closed', {
        id: positionId,
        totalPnL: `$${totalPnL.toFixed(2)}`,
        totalPnLPercent: `${position.totalPnLPercent.toFixed(2)}%`,
        duration: this.formatDuration(position.closedAt - position.entryTime)
      });

      // Remove from active positions
      this.positions.delete(positionId);
    } else {
      // Partially closed
      logger.info('Partial exit executed', {
        id: positionId,
        remaining: `${(position.remainingSize / position.size * 100).toFixed(0)}%`
      });
    }

    return exit;
  }

  /**
   * Emergency close all positions
   */
  async emergencyCloseAll(reason = 'EMERGENCY') {
    logger.warn('EMERGENCY: Closing all positions', { reason });

    const closePromises = [];

    for (const [positionId, position] of this.positions.entries()) {
      closePromises.push(
        this.closePosition(positionId, 1.0, reason)
          .catch(error => {
            logger.error(`Failed to close position ${positionId}:`, error);
          })
      );
    }

    await Promise.all(closePromises);

    logger.info('Emergency close complete');
  }

  /**
   * Start monitoring all positions
   */
  startMonitoring() {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    logger.info('Starting position monitoring');

    this.monitoringInterval = setInterval(async () => {
      await this.monitorAllPositions();
    }, this.monitorFrequency);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Position monitoring stopped');
    }
  }

  /**
   * Monitor all open positions
   */
  async monitorAllPositions() {
    if (this.positions.size === 0) {
      // No positions, stop monitoring
      this.stopMonitoring();
      return;
    }

    for (const [positionId, position] of this.positions.entries()) {
      try {
        // In production, would fetch current price from DEX
        // For now, simulate price updates
        // const currentPrice = await this.fetchCurrentPrice(position.token);

        // For testing: simulate price movement
        // await this.updatePosition(positionId, currentPrice);

      } catch (error) {
        logger.error(`Error monitoring position ${positionId}:`, error);
      }
    }
  }

  /**
   * Get all open positions
   */
  getOpenPositions() {
    return Array.from(this.positions.values()).filter(p => p.status === 'OPEN');
  }

  /**
   * Get position by ID
   */
  getPosition(positionId) {
    return this.positions.get(positionId);
  }

  /**
   * Get positions for a specific token
   */
  getPositionsForToken(token) {
    return this.getOpenPositions().filter(p => p.token === token);
  }

  /**
   * Calculate total portfolio exposure
   */
  getTotalExposure() {
    let totalExposure = 0;

    for (const position of this.getOpenPositions()) {
      totalExposure += position.remainingSize;
    }

    return totalExposure;
  }

  /**
   * Calculate total portfolio risk
   */
  getTotalRisk() {
    let totalRisk = 0;

    for (const position of this.getOpenPositions()) {
      totalRisk += position.maxLoss;
    }

    return totalRisk;
  }

  /**
   * Check if can open new position
   */
  canOpenPosition(token) {
    const openCount = this.getOpenPositions().length;
    const tokenPositions = this.getPositionsForToken(token);

    if (openCount >= this.limits.maxConcurrent) {
      return { canOpen: false, reason: 'Max concurrent positions reached' };
    }

    if (tokenPositions.length >= this.limits.maxPerToken) {
      return { canOpen: false, reason: 'Max positions per token reached' };
    }

    const totalRisk = this.getTotalRisk();
    if (totalRisk >= this.limits.maxPortfolioRisk) {
      return { canOpen: false, reason: 'Max portfolio risk reached' };
    }

    return { canOpen: true };
  }

  /**
   * Get position summary
   */
  getSummary() {
    const open = this.getOpenPositions();

    let totalPnL = 0;
    let winningCount = 0;
    let losingCount = 0;

    for (const position of open) {
      totalPnL += position.unrealizedPnL;
      if (position.unrealizedPnL > 0) winningCount++;
      else if (position.unrealizedPnL < 0) losingCount++;
    }

    return {
      openPositions: open.length,
      totalExposure: this.getTotalExposure(),
      totalRisk: this.getTotalRisk(),
      totalUnrealizedPnL: totalPnL,
      winning: winningCount,
      losing: losingCount,
      breakeven: open.length - winningCount - losingCount
    };
  }

  /**
   * Helper: Generate unique position ID
   */
  generatePositionId() {
    return `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Helper: Format duration
   */
  formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }
}

module.exports = PositionManager;
