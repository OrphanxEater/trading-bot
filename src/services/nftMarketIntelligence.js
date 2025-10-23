const axios = require('axios');
const logger = require('../utils/logger');
const Helpers = require('../utils/helpers');

/**
 * NFT Market Intelligence
 * Analyzes NFT market conditions and identifies profitable trading opportunities
 */
class NFTMarketIntelligence {
  constructor() {
    this.tensorApiBase = 'https://api.tensor.so/graphql';
    this.analysisCache = new Map();
    this.cacheDuration = 600000; // 10 minutes
  }

  /**
   * Analyze NFT market conditions
   * @param {number} lookbackHours - Hours to analyze
   */
  async analyzeNFTMarket(lookbackHours = 8) {
    try {
      logger.info('Analyzing NFT market conditions...', { lookbackHours });

      const analysis = {
        timestamp: Date.now(),
        trendingCollections: [],
        volumeLeaders: [],
        profitableOpportunities: [],
        marketMakingCandidates: [],
        overallActivity: null,
        recommendation: null
      };

      // Get trending collections
      analysis.trendingCollections = await this.getTrendingCollections();

      // Analyze top collections for opportunities
      if (analysis.trendingCollections.length > 0) {
        const topCollections = analysis.trendingCollections.slice(0, 5);

        for (const collection of topCollections) {
          const opportunity = await this.analyzeCollection(collection);

          if (opportunity.isViable) {
            analysis.profitableOpportunities.push(opportunity);

            if (opportunity.marketMakingViable) {
              analysis.marketMakingCandidates.push(opportunity);
            }
          }
        }
      }

      // Determine overall NFT market activity
      analysis.overallActivity = this.determineMarketActivity(analysis);

      // Generate recommendation
      analysis.recommendation = this.generateNFTRecommendation(analysis);

      logger.success('NFT market analysis complete', {
        trendingCount: analysis.trendingCollections.length,
        opportunities: analysis.profitableOpportunities.length,
        marketMakers: analysis.marketMakingCandidates.length,
        activity: analysis.overallActivity,
        recommendation: analysis.recommendation.action
      });

      return analysis;
    } catch (error) {
      logger.error('NFT market analysis failed', { error: error.message });
      return {
        timestamp: Date.now(),
        overallActivity: 'LOW',
        recommendation: {
          action: 'SKIP',
          reason: 'Analysis failed',
          allocation: 0
        }
      };
    }
  }

  /**
   * Get trending NFT collections
   */
  async getTrendingCollections() {
    try {
      // Using placeholder data structure
      // In production, you'd query Tensor's actual API
      logger.info('Fetching trending collections...');

      // Simulated trending collections for now
      // In production, replace with actual Tensor API call
      const collections = this.getMockTrendingCollections();

      logger.info(`Found ${collections.length} trending collections`);

      return collections;
    } catch (error) {
      logger.error('Failed to fetch trending collections', { error: error.message });
      return [];
    }
  }

  /**
   * Mock trending collections (replace with real API)
   */
  getMockTrendingCollections() {
    return [
      {
        slug: 'mad_lads',
        name: 'Mad Lads',
        floorPrice: 75.5,
        volume24h: 1250.5,
        sales24h: 156,
        listedCount: 890,
        totalSupply: 10000
      },
      {
        slug: 'tensorians',
        name: 'Tensorians',
        floorPrice: 12.3,
        volume24h: 450.2,
        sales24h: 89,
        listedCount: 450,
        totalSupply: 5000
      },
      {
        slug: 'famous_fox_federation',
        name: 'Famous Fox Federation',
        floorPrice: 42.1,
        volume24h: 820.5,
        sales24h: 123,
        listedCount: 650,
        totalSupply: 7777
      }
    ];
  }

  /**
   * Analyze individual collection for opportunities
   */
  async analyzeCollection(collection) {
    try {
      const analysis = {
        slug: collection.slug,
        name: collection.name,
        floorPrice: collection.floorPrice,
        volume24h: collection.volume24h,
        sales24h: collection.sales24h,
        isViable: false,
        marketMakingViable: false,
        metrics: {},
        reason: ''
      };

      // Calculate metrics
      const listingRatio = collection.listedCount / collection.totalSupply;
      const avgSalePrice = collection.volume24h / collection.sales24h;
      const velocityScore = collection.sales24h / collection.listedCount;

      analysis.metrics = {
        listingRatio: (listingRatio * 100).toFixed(2) + '%',
        avgSalePrice: avgSalePrice.toFixed(2),
        velocityScore: velocityScore.toFixed(3),
        liquidityScore: this.calculateLiquidityScore(collection)
      };

      // Determine if viable for trading
      // High volume + reasonable liquidity = viable
      if (collection.volume24h > 100 && listingRatio > 0.05 && listingRatio < 0.3) {
        analysis.isViable = true;
        analysis.reason = 'Good volume with healthy listing ratio';

        // Check if suitable for market making
        // Need: consistent sales, reasonable spread potential
        if (velocityScore > 0.1 && collection.sales24h > 50) {
          analysis.marketMakingViable = true;
          analysis.potentialSpread = this.estimateSpread(collection);
          analysis.reason += ', suitable for market making';
        }
      } else if (collection.volume24h < 50) {
        analysis.reason = 'Volume too low';
      } else if (listingRatio < 0.05) {
        analysis.reason = 'Insufficient liquidity';
      } else if (listingRatio > 0.3) {
        analysis.reason = 'Too many listings (potential dump)';
      }

      return analysis;
    } catch (error) {
      logger.error('Collection analysis failed', {
        collection: collection.name,
        error: error.message
      });
      return {
        slug: collection.slug,
        isViable: false,
        marketMakingViable: false,
        reason: 'Analysis error'
      };
    }
  }

  /**
   * Calculate liquidity score
   */
  calculateLiquidityScore(collection) {
    // Score based on: volume, sales count, listing ratio
    const volumeScore = Math.min(collection.volume24h / 1000, 10); // Max 10 points
    const salesScore = Math.min(collection.sales24h / 100, 10); // Max 10 points
    const listingRatio = collection.listedCount / collection.totalSupply;
    const listingScore = listingRatio > 0.1 && listingRatio < 0.25 ? 10 : 5;

    const totalScore = ((volumeScore + salesScore + listingScore) / 30) * 100;

    return {
      score: totalScore.toFixed(0),
      rating: totalScore > 70 ? 'HIGH' : totalScore > 40 ? 'MEDIUM' : 'LOW'
    };
  }

  /**
   * Estimate potential spread for market making
   */
  estimateSpread(collection) {
    // Typical NFT market making spreads are 2-10%
    const baseSpread = 0.03; // 3% base

    // Adjust based on volatility (higher volume = potentially tighter spreads)
    const volumeFactor = Math.min(collection.volume24h / 1000, 1);
    const adjustedSpread = baseSpread * (1 - volumeFactor * 0.3);

    return {
      bidBelowFloor: (adjustedSpread * 100).toFixed(1) + '%',
      askAboveFloor: (adjustedSpread * 100).toFixed(1) + '%',
      estimatedSpread: (adjustedSpread * 2 * 100).toFixed(1) + '%'
    };
  }

  /**
   * Determine overall NFT market activity
   */
  determineMarketActivity(analysis) {
    const { trendingCollections, profitableOpportunities } = analysis;

    if (profitableOpportunities.length >= 3) {
      return 'HIGH';
    } else if (profitableOpportunities.length >= 1) {
      return 'MEDIUM';
    } else if (trendingCollections.length > 0) {
      return 'LOW';
    }

    return 'VERY_LOW';
  }

  /**
   * Generate NFT trading recommendation
   */
  generateNFTRecommendation(analysis) {
    const { overallActivity, marketMakingCandidates, profitableOpportunities } = analysis;

    let action = 'SKIP';
    let allocation = 0;
    let reason = '';
    let collections = [];

    if (overallActivity === 'HIGH' && marketMakingCandidates.length >= 2) {
      action = 'MARKET_MAKE';
      allocation = 0.3; // 30% of portfolio
      reason = 'Multiple viable collections for market making';
      collections = marketMakingCandidates.slice(0, 3).map(c => c.slug);
    } else if (overallActivity === 'MEDIUM' && marketMakingCandidates.length >= 1) {
      action = 'MARKET_MAKE';
      allocation = 0.2; // 20% of portfolio
      reason = 'Limited but viable NFT opportunities';
      collections = marketMakingCandidates.slice(0, 2).map(c => c.slug);
    } else if (profitableOpportunities.length > 0) {
      action = 'MONITOR';
      allocation = 0.1; // 10% reserved
      reason = 'Opportunities exist but not ideal for market making';
      collections = profitableOpportunities.slice(0, 2).map(c => c.slug);
    } else {
      action = 'SKIP';
      allocation = 0;
      reason = 'No viable NFT opportunities detected';
    }

    return {
      action,
      allocation,
      reason,
      collections,
      confidence: this.calculateConfidence(action, analysis)
    };
  }

  /**
   * Calculate confidence in recommendation
   */
  calculateConfidence(action, analysis) {
    if (action === 'SKIP') return 90;

    const baseConfidence = 50;
    const activityBonus = {
      'HIGH': 30,
      'MEDIUM': 20,
      'LOW': 10,
      'VERY_LOW': 0
    };

    const opportunityBonus = Math.min(analysis.profitableOpportunities.length * 5, 20);

    return Math.min(baseConfidence + activityBonus[analysis.overallActivity] + opportunityBonus, 95);
  }

  /**
   * Generate NFT market report
   */
  generateReport(analysis) {
    if (!analysis) return 'No NFT analysis available';

    const report = `
╔════════════════════════════════════════════════════════════╗
║           NFT MARKET INTELLIGENCE REPORT                   ║
╠════════════════════════════════════════════════════════════╣
║ Market Activity: ${analysis.overallActivity?.padEnd(42)}║
║ Trending Collections: ${String(analysis.trendingCollections?.length || 0).padEnd(37)}║
║ Profitable Opportunities: ${String(analysis.profitableOpportunities?.length || 0).padEnd(33)}║
║ Market Making Candidates: ${String(analysis.marketMakingCandidates?.length || 0).padEnd(33)}║
╠════════════════════════════════════════════════════════════╣
║ RECOMMENDATION: ${analysis.recommendation?.action?.padEnd(39)}║
║ Allocation: ${(analysis.recommendation?.allocation * 100 + '%').padEnd(45)}║
║ Confidence: ${(analysis.recommendation?.confidence + '%').padEnd(45)}║
║ Reason: ${(analysis.recommendation?.reason || 'N/A').substring(0, 49).padEnd(49)}║
╚════════════════════════════════════════════════════════════╝
    `;

    if (analysis.marketMakingCandidates?.length > 0) {
      logger.info('Top NFT Market Making Candidates:', {
        collections: analysis.marketMakingCandidates.slice(0, 3).map(c => ({
          name: c.name,
          floor: c.floorPrice + ' SOL',
          volume: c.volume24h + ' SOL',
          liquidity: c.metrics.liquidityScore.rating
        }))
      });
    }

    return report;
  }
}

module.exports = NFTMarketIntelligence;
