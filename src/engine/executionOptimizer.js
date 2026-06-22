const logger = require('../utils/logger');

/**
 * EXECUTION OPTIMIZER
 *
 * Determines:
 * 1. WHEN to execute (now vs wait vs staged)
 * 2. HOW MUCH to trade (position sizing)
 * 3. HOW to execute (market vs limit vs split)
 * 4. WHERE to execute (DEX selection)
 *
 * Optimizes for:
 * - Minimal slippage
 * - Optimal fill price
 * - Risk-adjusted sizing
 * - Market impact minimization
 */

class ExecutionOptimizer {
  constructor(config) {
    this.config = config;

    // Execution parameters
    this.params = {
      baseAllocation: config.baseAllocation || 0.10,      // 10% base position size
      maxSpreadBps: config.maxSpreadBps || 50,            // Max 0.5% spread
      minLiquidity: config.minLiquidity || 100000,        // Min $100k liquidity
      maxSlippageBps: config.maxSlippageBps || 100,       // Max 1% slippage
      maxImpactBps: config.maxImpactBps || 50,            // Max 0.5% market impact
      twapDuration: config.twapDuration || 900000,        // 15 min TWAP
      urgentPriorityFee: config.urgentPriorityFee || 10000, // 10k microlamports
      normalPriorityFee: config.normalPriorityFee || 5000
    };

    logger.info('Execution Optimizer initialized', this.params);
  }

  /**
   * Main optimization function
   *
   * @param {Object} decision - Decision from DecisionEngine
   * @param {Object} marketData - Current market conditions
   * @param {Object} portfolio - Current portfolio state
   * @returns {Object} - Optimized execution plan
   */
  async optimize(decision, marketData, portfolio) {
    try {
      if (decision.action !== 'EXECUTE') {
        return { execute: false, reason: `Action is ${decision.action}` };
      }

      logger.info('Optimizing execution', {
        token: decision.token,
        confidence: decision.confidence,
        urgency: decision.urgency
      });

      // Step 1: Calculate position size
      const positionSize = this.calculatePositionSize(
        decision,
        marketData,
        portfolio
      );

      // Step 2: Determine execution timing
      const timing = this.determineExecutionTiming(
        decision,
        marketData,
        positionSize
      );

      // Step 3: Select execution method
      const method = this.selectExecutionMethod(
        timing,
        positionSize,
        marketData
      );

      // Step 4: Calculate price limits
      const priceLimits = this.calculatePriceLimits(
        decision,
        marketData,
        method
      );

      // Step 5: Select DEX and route
      const routing = this.selectDEXRouting(
        decision.token,
        positionSize,
        marketData
      );

      // Step 6: Calculate fees and costs
      const costs = this.estimateCosts(
        positionSize,
        marketData,
        method,
        routing
      );

      // Step 7: Build execution plan
      const plan = {
        execute: true,
        token: decision.token,
        direction: decision.execution.direction,

        // Sizing
        positionSize: positionSize.usdValue,
        tokenAmount: positionSize.tokenAmount,
        percentOfPortfolio: positionSize.percentOfPortfolio,

        // Timing
        executeAt: timing.executeAt,
        executeBy: timing.deadline,
        urgency: timing.urgency,
        waitReason: timing.waitReason,

        // Method
        method: method.type,              // MARKET, LIMIT, TWAP, ICEBERG
        splits: method.splits,            // Number of sub-orders
        splitDuration: method.duration,   // Time between splits

        // Pricing
        maxPrice: priceLimits.maxEntry,   // For buys
        minPrice: priceLimits.minEntry,   // For sells
        stopLoss: priceLimits.stopLoss,
        takeProfit: priceLimits.takeProfit,
        limitPrice: priceLimits.limitPrice,

        // Routing
        dex: routing.primary,
        backupDEX: routing.backup,
        route: routing.route,
        expectedSlippage: routing.slippage,

        // Costs
        estimatedCosts: costs,
        netExpectedProfit: this.calculateNetProfit(decision, costs),

        // Risk
        riskParameters: {
          maxLoss: positionSize.usdValue * decision.risk.maxLoss,
          riskReward: decision.risk.riskReward,
          portfolioRisk: positionSize.percentOfPortfolio * decision.risk.maxLoss
        },

        // Solana-specific
        priorityFee: this.calculatePriorityFee(timing.urgency),
        computeUnits: 200000,

        timestamp: Date.now()
      };

      logger.success('Execution plan created', {
        token: decision.token,
        size: `$${positionSize.usdValue.toFixed(2)}`,
        method: method.type,
        executeAt: timing.executeAt === 'NOW' ? 'NOW' : new Date(timing.executeAt).toISOString()
      });

      return plan;

    } catch (error) {
      logger.error('Execution optimization failed:', error);
      return { execute: false, reason: 'OPTIMIZATION_ERROR: ' + error.message };
    }
  }

  /**
   * Calculate optimal position size
   */
  calculatePositionSize(decision, marketData, portfolio) {
    // Base size from config
    let baseSize = portfolio.availableCapital * this.params.baseAllocation;

    // Adjust for confidence
    const confidenceMultiplier = decision.positionSizeMultiplier;

    // Adjust for volatility (lower size in high volatility)
    const volatilityMultiplier = this.getVolatilityMultiplier(marketData.volatility);

    // Adjust for liquidity (lower size if thin liquidity)
    const liquidityMultiplier = this.getLiquidityMultiplier(marketData.liquidity);

    // Adjust for existing portfolio exposure
    const exposureMultiplier = 1 - (portfolio.currentExposure || 0);

    // Final size
    const finalUSDSize = baseSize *
      confidenceMultiplier *
      volatilityMultiplier *
      liquidityMultiplier *
      exposureMultiplier;

    // Convert to token amount
    const tokenAmount = finalUSDSize / marketData.price;

    // Check against limits
    const maxSize = portfolio.availableCapital * 0.25; // Max 25% per trade
    const clampedSize = Math.min(finalUSDSize, maxSize);

    logger.debug('Position sizing', {
      base: baseSize.toFixed(2),
      confidence: confidenceMultiplier.toFixed(2),
      volatility: volatilityMultiplier.toFixed(2),
      liquidity: liquidityMultiplier.toFixed(2),
      exposure: exposureMultiplier.toFixed(2),
      final: clampedSize.toFixed(2)
    });

    return {
      usdValue: clampedSize,
      tokenAmount: tokenAmount,
      percentOfPortfolio: clampedSize / portfolio.totalCapital,
      multipliers: {
        confidence: confidenceMultiplier,
        volatility: volatilityMultiplier,
        liquidity: liquidityMultiplier,
        exposure: exposureMultiplier
      }
    };
  }

  /**
   * Get volatility multiplier (0.5 - 1.5)
   */
  getVolatilityMultiplier(volatility) {
    // High volatility = smaller size
    const volatilityRatio = volatility / 100; // Assuming volatility in %
    return Math.max(0.5, Math.min(1.5, 1 - volatilityRatio));
  }

  /**
   * Get liquidity multiplier (0.3 - 1.0)
   */
  getLiquidityMultiplier(liquidity) {
    // Thin liquidity = smaller size to avoid impact
    if (liquidity >= 1000000) return 1.0;      // $1M+ = full size
    if (liquidity >= 500000) return 0.8;       // $500k = 80%
    if (liquidity >= 250000) return 0.6;       // $250k = 60%
    if (liquidity >= 100000) return 0.4;       // $100k = 40%
    return 0.3;                                 // <$100k = 30%
  }

  /**
   * Determine when to execute
   */
  determineExecutionTiming(decision, marketData, positionSize) {
    const timing = {
      executeAt: 'NOW',
      deadline: Date.now() + 3600000, // 1 hour from now
      urgency: decision.urgency,
      waitReason: null
    };

    // Check spread
    const spreadBps = (marketData.spread / marketData.price) * 10000;

    if (spreadBps > this.params.maxSpreadBps) {
      // Spread too wide
      if (decision.urgency === 'IMMEDIATE') {
        // Execute anyway but note the cost
        timing.waitReason = `Wide spread (${spreadBps.toFixed(0)}bps) but urgent`;
      } else {
        // Wait for tighter spread
        timing.executeAt = Date.now() + 300000; // Wait 5 minutes
        timing.waitReason = `Waiting for tighter spread (currently ${spreadBps.toFixed(0)}bps)`;
      }
    }

    // Check for volatility spike
    if (marketData.recentVolatilitySpike) {
      if (decision.urgency !== 'IMMEDIATE') {
        timing.executeAt = Date.now() + 120000; // Wait 2 minutes for stabilization
        timing.waitReason = 'Volatility spike detected, waiting for stabilization';
      }
    }

    // Check time of day (avoid low liquidity hours)
    const hour = new Date().getUTCHours();
    if (hour >= 0 && hour <= 6 && decision.urgency !== 'IMMEDIATE') {
      // Asian hours - low liquidity
      const targetTime = new Date();
      targetTime.setUTCHours(14, 0, 0, 0); // Wait until 14:00 UTC (peak hours)
      if (targetTime < Date.now()) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      timing.executeAt = targetTime.getTime();
      timing.waitReason = 'Low liquidity hours, waiting for peak hours';
    }

    return timing;
  }

  /**
   * Select execution method
   */
  selectExecutionMethod(timing, positionSize, marketData) {
    // If position is small relative to liquidity, use market order
    const impactRatio = positionSize.usdValue / marketData.liquidity;

    if (impactRatio < 0.01) {
      // <1% of liquidity - safe to market buy
      return {
        type: 'MARKET',
        splits: 1,
        duration: 0
      };
    } else if (impactRatio < 0.05) {
      // 1-5% of liquidity - use limit order
      return {
        type: 'LIMIT',
        splits: 1,
        duration: 0
      };
    } else if (impactRatio < 0.10) {
      // 5-10% of liquidity - split into 2-3 orders (TWAP)
      return {
        type: 'TWAP',
        splits: 3,
        duration: this.params.twapDuration
      };
    } else {
      // >10% of liquidity - use iceberg orders
      return {
        type: 'ICEBERG',
        splits: 5,
        duration: this.params.twapDuration * 2
      };
    }
  }

  /**
   * Calculate price limits
   */
  calculatePriceLimits(decision, marketData, method) {
    const currentPrice = marketData.price;

    let maxSlippage;
    if (method.type === 'MARKET') {
      maxSlippage = this.params.maxSlippageBps / 10000; // Convert bps to decimal
    } else {
      maxSlippage = this.params.maxSpreadBps / 10000;
    }

    const limits = {
      maxEntry: currentPrice * (1 + maxSlippage),      // Max buy price
      minEntry: currentPrice * (1 - maxSlippage),      // Min sell price
      limitPrice: currentPrice,                         // For limit orders
      stopLoss: decision.execution.stopLoss,
      takeProfit: decision.execution.takeProfit
    };

    // Adjust limit price based on direction
    if (decision.execution.direction === 'LONG') {
      // For buys, set limit slightly above current to ensure fill
      limits.limitPrice = currentPrice * 1.002; // 0.2% above
    } else {
      // For sells, set limit slightly below current
      limits.limitPrice = currentPrice * 0.998; // 0.2% below
    }

    return limits;
  }

  /**
   * Select best DEX routing
   */
  selectDEXRouting(token, positionSize, marketData) {
    // In production, this would query multiple DEXs and use Jupiter aggregator
    // For now, use simplified logic

    const routing = {
      primary: 'Jupiter',      // Jupiter aggregates best route
      backup: 'Raydium',       // Fallback to Raydium directly
      route: [
        { dex: 'Orca', percentage: 0.6 },
        { dex: 'Raydium', percentage: 0.4 }
      ],
      slippage: 0.005         // Expected 0.5% slippage
    };

    // Adjust slippage based on order size
    const impactRatio = positionSize.usdValue / marketData.liquidity;
    routing.slippage = Math.min(0.02, impactRatio * 2); // Cap at 2%

    return routing;
  }

  /**
   * Estimate total costs
   */
  estimateCosts(positionSize, marketData, method, routing) {
    const tradeSize = positionSize.usdValue;

    // DEX fees (typically 0.25-0.30%)
    const dexFees = tradeSize * 0.0025;

    // Slippage costs
    const slippageCost = tradeSize * routing.slippage;

    // Solana network fees
    const networkFee = 0.000005 * marketData.solPrice; // ~5000 lamports

    // Priority fees
    const priorityFee = (this.params.normalPriorityFee / 1000000000) * marketData.solPrice;

    // Total costs
    const totalCosts = dexFees + slippageCost + networkFee + priorityFee;

    return {
      dexFees: dexFees,
      slippage: slippageCost,
      network: networkFee,
      priority: priorityFee,
      total: totalCosts,
      totalBps: (totalCosts / tradeSize) * 10000
    };
  }

  /**
   * Calculate net expected profit after costs
   */
  calculateNetProfit(decision, costs) {
    if (!decision.execution) return 0;

    const entryPrice = decision.execution.entry;
    const targetPrice = decision.execution.takeProfit;
    const grossProfit = targetPrice - entryPrice;
    const grossProfitPercent = grossProfit / entryPrice;

    // Subtract costs
    const costPercent = costs.totalBps / 10000;
    const netProfitPercent = grossProfitPercent - costPercent;

    return {
      gross: grossProfitPercent,
      costs: costPercent,
      net: netProfitPercent,
      netBps: netProfitPercent * 10000
    };
  }

  /**
   * Calculate priority fee based on urgency
   */
  calculatePriorityFee(urgency) {
    switch (urgency) {
      case 'IMMEDIATE':
        return this.params.urgentPriorityFee;
      case 'NORMAL':
        return this.params.normalPriorityFee;
      case 'PATIENT':
        return Math.floor(this.params.normalPriorityFee / 2);
      default:
        return this.params.normalPriorityFee;
    }
  }

  /**
   * Validate execution plan
   */
  validatePlan(plan) {
    const issues = [];

    // Check if costs are too high
    if (plan.estimatedCosts.totalBps > 200) {
      issues.push(`High costs: ${plan.estimatedCosts.totalBps.toFixed(0)}bps`);
    }

    // Check if net profit is positive
    if (plan.netExpectedProfit.net < 0) {
      issues.push('Negative expected profit after costs');
    }

    // Check if position size is reasonable
    if (plan.percentOfPortfolio > 0.30) {
      issues.push(`Large position: ${(plan.percentOfPortfolio * 100).toFixed(1)}% of portfolio`);
    }

    if (issues.length > 0) {
      logger.warn('Execution plan validation issues', { issues });
      return { valid: false, issues };
    }

    return { valid: true };
  }
}

module.exports = ExecutionOptimizer;
