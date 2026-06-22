const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * Portfolio Allocation Manager
 * Intelligently allocates capital across multiple strategies
 */
class PortfolioManager {
  constructor(config) {
    this.config = config;
    this.allocations = new Map();
    this.totalCapital = 0;
    this.reserveRatio = parseFloat(config.reserveRatio || 0.1); // 10% reserve
    this.performanceHistory = new Map();
  }

  /**
   * Calculate optimal portfolio allocation
   * @param {number} totalBalance - Total available capital
   * @param {object} tokenAnalysis - Token market analysis
   * @param {object} nftAnalysis - NFT market analysis
   */
  calculateAllocation(totalBalance, tokenAnalysis, nftAnalysis) {
    logger.info('Calculating portfolio allocation...', {
      totalBalance: totalBalance.toFixed(4),
      tokenStrategy: tokenAnalysis.recommendedStrategy,
      nftAction: nftAnalysis.recommendation?.action
    });

    this.totalCapital = totalBalance;
    const allocations = {
      reserve: 0,
      tokenTrading: 0,
      nftMarketMaking: 0,
      strategy: null,
      breakdown: []
    };

    // Reserve allocation (always keep reserve)
    allocations.reserve = totalBalance * this.reserveRatio;
    let availableCapital = totalBalance - allocations.reserve;

    // Determine allocations based on market conditions
    const tokenWeight = this.calculateTokenWeight(tokenAnalysis);
    const nftWeight = this.calculateNFTWeight(nftAnalysis);

    // Normalize weights
    const totalWeight = tokenWeight + nftWeight;
    const normalizedTokenWeight = totalWeight > 0 ? tokenWeight / totalWeight : 0.7;
    const normalizedNFTWeight = totalWeight > 0 ? nftWeight / totalWeight : 0.3;

    // Allocate capital
    allocations.tokenTrading = availableCapital * normalizedTokenWeight;
    allocations.nftMarketMaking = availableCapital * normalizedNFTWeight;
    allocations.strategy = tokenAnalysis.recommendedStrategy;

    // Create detailed breakdown
    allocations.breakdown = [
      {
        category: 'Token Trading',
        strategy: tokenAnalysis.recommendedStrategy,
        amount: allocations.tokenTrading,
        percentage: (normalizedTokenWeight * 100).toFixed(1) + '%',
        confidence: tokenAnalysis.confidence
      },
      {
        category: 'NFT Market Making',
        strategy: nftAnalysis.recommendation?.action || 'SKIP',
        amount: allocations.nftMarketMaking,
        percentage: (normalizedNFTWeight * 100).toFixed(1) + '%',
        confidence: nftAnalysis.recommendation?.confidence || 0
      },
      {
        category: 'Reserve',
        strategy: 'Cash',
        amount: allocations.reserve,
        percentage: (this.reserveRatio * 100).toFixed(1) + '%',
        confidence: 100
      }
    ];

    // Store allocations
    this.allocations = allocations;

    logger.success('Portfolio allocation calculated', {
      tokenTrading: allocations.tokenTrading.toFixed(4) + ' SOL',
      nftMarketMaking: allocations.nftMarketMaking.toFixed(4) + ' SOL',
      reserve: allocations.reserve.toFixed(4) + ' SOL'
    });

    return allocations;
  }

  /**
   * Calculate weight for token trading based on analysis
   */
  calculateTokenWeight(analysis) {
    if (!analysis || !analysis.recommendedStrategy) {
      return 0.5; // Default 50% weight
    }

    let weight = 0.5; // Base weight

    // Adjust based on confidence
    const confidenceBonus = (analysis.confidence - 50) / 100; // -0.5 to +0.5
    weight += confidenceBonus * 0.3;

    // Adjust based on market regime
    if (analysis.marketRegime === 'TRENDING') {
      weight += 0.1;
    } else if (analysis.marketRegime === 'VOLATILE_RANGING') {
      weight += 0.05;
    }

    // Adjust based on volatility
    if (analysis.volatility?.level === 'HIGH' || analysis.volatility?.level === 'VERY_HIGH') {
      weight += 0.1; // More opportunity in volatile markets
    }

    // Adjust based on liquidity
    if (analysis.volumeData?.liquidityLevel === 'HIGH' || analysis.volumeData?.liquidityLevel === 'VERY_HIGH') {
      weight += 0.1;
    }

    return Math.max(0.2, Math.min(weight, 0.8)); // Clamp between 20-80%
  }

  /**
   * Calculate weight for NFT trading based on analysis
   */
  calculateNFTWeight(analysis) {
    if (!analysis || !analysis.recommendation) {
      return 0.1; // Default 10% weight
    }

    const { action, allocation, confidence } = analysis.recommendation;

    if (action === 'SKIP') {
      return 0; // No allocation
    }

    let weight = allocation; // Use recommended allocation as base

    // Adjust based on confidence
    const confidenceMultiplier = confidence / 100;
    weight *= confidenceMultiplier;

    // Adjust based on market activity
    if (analysis.overallActivity === 'HIGH') {
      weight *= 1.2;
    } else if (analysis.overallActivity === 'MEDIUM') {
      weight *= 1.0;
    } else {
      weight *= 0.8;
    }

    return Math.max(0, Math.min(weight, 0.4)); // Clamp between 0-40%
  }

  /**
   * Get recommended position size for a trade
   */
  getPositionSize(category, riskLevel = 'MEDIUM') {
    const allocation = this.allocations[category === 'token' ? 'tokenTrading' : 'nftMarketMaking'];

    if (!allocation || allocation === 0) {
      return 0;
    }

    // Risk-based position sizing
    const riskMultipliers = {
      'LOW': 0.3,
      'MEDIUM': 0.5,
      'HIGH': 0.7
    };

    const multiplier = riskMultipliers[riskLevel] || 0.5;
    const positionSize = allocation * multiplier;

    return positionSize;
  }

  /**
   * Rebalance portfolio based on performance
   */
  async rebalanceIfNeeded(currentBalances, tokenAnalysis, nftAnalysis) {
    // Check if significant time has passed or balance changed significantly
    const shouldRebalance = this.shouldRebalance(currentBalances);

    if (shouldRebalance) {
      logger.info('Rebalancing portfolio...');
      return this.calculateAllocation(currentBalances.SOL, tokenAnalysis, nftAnalysis);
    }

    return this.allocations;
  }

  /**
   * Determine if rebalancing is needed
   */
  shouldRebalance(currentBalances) {
    if (!this.totalCapital || this.totalCapital === 0) {
      return true; // First time allocation
    }

    // Rebalance if balance changed by more than 20%
    const balanceChange = Math.abs(currentBalances.SOL - this.totalCapital) / this.totalCapital;

    return balanceChange > 0.2;
  }

  /**
   * Track strategy performance
   */
  recordPerformance(strategy, profit, tradeCount) {
    if (!this.performanceHistory.has(strategy)) {
      this.performanceHistory.set(strategy, {
        totalProfit: 0,
        tradeCount: 0,
        winCount: 0
      });
    }

    const perf = this.performanceHistory.get(strategy);
    perf.totalProfit += profit;
    perf.tradeCount += tradeCount;
    if (profit > 0) perf.winCount++;

    this.performanceHistory.set(strategy, perf);
  }

  /**
   * Get performance-based weights
   */
  getPerformanceWeights() {
    const weights = {};
    let totalPerformance = 0;

    // Calculate performance scores
    for (const [strategy, perf] of this.performanceHistory.entries()) {
      if (perf.tradeCount > 0) {
        const winRate = perf.winCount / perf.tradeCount;
        const avgProfit = perf.totalProfit / perf.tradeCount;
        const score = Math.max(0, winRate * avgProfit);

        weights[strategy] = score;
        totalPerformance += score;
      }
    }

    // Normalize weights
    if (totalPerformance > 0) {
      for (const strategy in weights) {
        weights[strategy] /= totalPerformance;
      }
    }

    return weights;
  }

  /**
   * Generate allocation report
   */
  generateReport() {
    if (!this.allocations || !this.allocations.breakdown) {
      return 'No allocation calculated';
    }

    const report = `
╔════════════════════════════════════════════════════════════╗
║           PORTFOLIO ALLOCATION REPORT                      ║
╠════════════════════════════════════════════════════════════╣
║ Total Capital: ${this.totalCapital.toFixed(4).padStart(10)} SOL                       ║
╠════════════════════════════════════════════════════════════╣`;

    this.allocations.breakdown.forEach(item => {
      const categoryLine = `║ ${item.category.padEnd(20)} ${item.percentage.padStart(6)} │ ${item.amount.toFixed(4).padStart(10)} SOL ║`;
      const strategyLine = `║   └─ Strategy: ${item.strategy.padEnd(38)}║`;

      return report + '\n' + categoryLine + '\n' + strategyLine;
    });

    return report + `
╚════════════════════════════════════════════════════════════╝
    `;
  }

  /**
   * Display allocation details
   */
  displayAllocation() {
    if (!this.allocations) {
      logger.warn('No allocation to display');
      return;
    }

    logger.info('═══════════════════════════════════════════');
    logger.info('        PORTFOLIO ALLOCATION');
    logger.info('═══════════════════════════════════════════');

    this.allocations.breakdown?.forEach(item => {
      logger.info(`${item.category}:`, {
        strategy: item.strategy,
        amount: item.amount.toFixed(4) + ' SOL',
        percentage: item.percentage,
        confidence: item.confidence + '%'
      });
    });

    logger.info('═══════════════════════════════════════════');
  }

  /**
   * Get current allocations
   */
  getAllocations() {
    return this.allocations;
  }
}

module.exports = PortfolioManager;
