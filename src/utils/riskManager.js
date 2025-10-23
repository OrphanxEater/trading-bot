const BigNumber = require('bignumber.js');
const logger = require('./logger');

/**
 * Risk Management System
 * Implements position sizing, Kelly Criterion, and risk controls
 */
class RiskManager {
  constructor(config) {
    this.config = config;
    this.maxDrawdown = parseFloat(config.maxDrawdown || 0.2); // 20% max drawdown
    this.maxPositionSize = parseFloat(config.maxPositionSize || 0.25); // 25% max per trade
    this.kellyFraction = parseFloat(config.kellyFraction || 0.25); // Use 1/4 Kelly
    this.maxDailyLoss = parseFloat(config.maxDailyLoss || 0.1); // 10% daily loss limit

    this.peakBalance = 0;
    this.dailyStartBalance = 0;
    this.dailyPnL = 0;
    this.lastResetDate = new Date().toDateString();
  }

  /**
   * Calculate position size using Kelly Criterion
   * @param {number} winRate - Historical win rate (0-1)
   * @param {number} avgWin - Average winning trade size
   * @param {number} avgLoss - Average losing trade size
   * @param {number} accountBalance - Current account balance
   */
  calculateKellyPositionSize(winRate, avgWin, avgLoss, accountBalance) {
    if (avgLoss === 0) {
      logger.warn('Average loss is zero, cannot calculate Kelly');
      return accountBalance * this.maxPositionSize;
    }

    const winLossRatio = avgWin / Math.abs(avgLoss);
    const kelly = (winRate * winLossRatio - (1 - winRate)) / winLossRatio;

    // Use fractional Kelly for safety
    const fractionalKelly = Math.max(0, kelly * this.kellyFraction);

    // Cap at max position size
    const positionFraction = Math.min(fractionalKelly, this.maxPositionSize);

    logger.debug('Kelly position sizing', {
      winRate,
      winLossRatio,
      kelly,
      fractionalKelly,
      positionFraction
    });

    return accountBalance * positionFraction;
  }

  /**
   * Calculate volatility-adjusted position size using ATR
   * @param {number} atr - Average True Range
   * @param {number} price - Current price
   * @param {number} accountBalance - Account balance
   * @param {number} riskPerTrade - Risk per trade as fraction (e.g., 0.02 for 2%)
   */
  calculateATRPositionSize(atr, price, accountBalance, riskPerTrade = 0.02) {
    if (!atr || atr === 0 || !price) {
      logger.warn('Invalid ATR or price for position sizing');
      return accountBalance * 0.01; // Conservative 1% position
    }

    // Risk amount in dollars
    const riskAmount = accountBalance * riskPerTrade;

    // ATR as percentage of price
    const atrPercent = atr / price;

    // Position size = risk amount / (ATR * multiplier)
    // Using 2x ATR as stop distance
    const positionSize = riskAmount / (atrPercent * 2);

    // Cap at max position size
    const maxSize = accountBalance * this.maxPositionSize;
    const finalSize = Math.min(positionSize, maxSize);

    logger.debug('ATR position sizing', {
      atr,
      price,
      atrPercent: (atrPercent * 100).toFixed(2) + '%',
      riskAmount,
      positionSize: finalSize
    });

    return finalSize;
  }

  /**
   * Simple percentage-based position sizing
   * @param {number} accountBalance - Current balance
   * @param {number} percentage - Percentage to risk (0-1)
   */
  calculateFixedPercentageSize(accountBalance, percentage = 0.1) {
    const fraction = Math.min(percentage, this.maxPositionSize);
    return accountBalance * fraction;
  }

  /**
   * Check if drawdown limit is breached
   * @param {number} currentBalance - Current account balance
   */
  checkDrawdown(currentBalance) {
    // Update peak balance
    if (currentBalance > this.peakBalance) {
      this.peakBalance = currentBalance;
    }

    const drawdown = (this.peakBalance - currentBalance) / this.peakBalance;

    if (drawdown >= this.maxDrawdown) {
      logger.error('MAX DRAWDOWN BREACHED', {
        peakBalance: this.peakBalance,
        currentBalance,
        drawdown: (drawdown * 100).toFixed(2) + '%',
        maxDrawdown: (this.maxDrawdown * 100).toFixed(2) + '%'
      });
      return false;
    }

    if (drawdown > this.maxDrawdown * 0.7) {
      logger.warn('Approaching max drawdown', {
        currentDrawdown: (drawdown * 100).toFixed(2) + '%',
        maxDrawdown: (this.maxDrawdown * 100).toFixed(2) + '%'
      });
    }

    return true;
  }

  /**
   * Check daily loss limit
   * @param {number} currentBalance - Current balance
   */
  checkDailyLoss(currentBalance) {
    const today = new Date().toDateString();

    // Reset daily tracking if new day
    if (today !== this.lastResetDate) {
      this.dailyStartBalance = currentBalance;
      this.dailyPnL = 0;
      this.lastResetDate = today;
      logger.info('Daily risk limits reset');
      return true;
    }

    const dailyLoss = (this.dailyStartBalance - currentBalance) / this.dailyStartBalance;

    if (dailyLoss >= this.maxDailyLoss) {
      logger.error('DAILY LOSS LIMIT REACHED', {
        startBalance: this.dailyStartBalance,
        currentBalance,
        loss: (dailyLoss * 100).toFixed(2) + '%',
        maxLoss: (this.maxDailyLoss * 100).toFixed(2) + '%'
      });
      return false;
    }

    return true;
  }

  /**
   * Check all risk controls
   * @param {number} currentBalance - Current balance
   */
  checkRiskControls(currentBalance) {
    const drawdownOk = this.checkDrawdown(currentBalance);
    const dailyLossOk = this.checkDailyLoss(currentBalance);

    return drawdownOk && dailyLossOk;
  }

  /**
   * Calculate risk-reward ratio
   * @param {number} entryPrice - Entry price
   * @param {number} stopLoss - Stop loss price
   * @param {number} takeProfit - Take profit price
   */
  calculateRiskReward(entryPrice, stopLoss, takeProfit) {
    const risk = Math.abs(entryPrice - stopLoss);
    const reward = Math.abs(takeProfit - entryPrice);

    if (risk === 0) return 0;

    return reward / risk;
  }

  /**
   * Validate trade based on risk parameters
   * @param {object} tradeParams - Trade parameters
   */
  validateTrade(tradeParams) {
    const {
      entryPrice,
      stopLoss,
      takeProfit,
      positionSize,
      accountBalance
    } = tradeParams;

    const validations = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Check position size
    const positionPercent = positionSize / accountBalance;
    if (positionPercent > this.maxPositionSize) {
      validations.valid = false;
      validations.errors.push(
        `Position size ${(positionPercent * 100).toFixed(2)}% exceeds maximum ${(this.maxPositionSize * 100).toFixed(2)}%`
      );
    }

    // Check risk-reward ratio
    if (stopLoss && takeProfit) {
      const rrRatio = this.calculateRiskReward(entryPrice, stopLoss, takeProfit);
      if (rrRatio < 1.5) {
        validations.warnings.push(
          `Risk-reward ratio ${rrRatio.toFixed(2)} is below recommended 1.5:1`
        );
      }
    }

    // Check risk controls
    if (!this.checkRiskControls(accountBalance)) {
      validations.valid = false;
      validations.errors.push('Risk control limits breached');
    }

    return validations;
  }

  /**
   * Get current risk metrics
   */
  getRiskMetrics(currentBalance) {
    const drawdown = this.peakBalance > 0
      ? (this.peakBalance - currentBalance) / this.peakBalance
      : 0;

    const dailyPnL = this.dailyStartBalance > 0
      ? (currentBalance - this.dailyStartBalance) / this.dailyStartBalance
      : 0;

    return {
      peakBalance: this.peakBalance,
      currentBalance,
      drawdown: (drawdown * 100).toFixed(2) + '%',
      maxDrawdown: (this.maxDrawdown * 100).toFixed(2) + '%',
      dailyPnL: (dailyPnL * 100).toFixed(2) + '%',
      maxDailyLoss: (this.maxDailyLoss * 100).toFixed(2) + '%',
      riskControlsOk: this.checkRiskControls(currentBalance)
    };
  }
}

module.exports = RiskManager;
