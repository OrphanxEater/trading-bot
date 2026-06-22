const axios = require('axios');
const logger = require('../utils/logger');
const TechnicalIndicators = require('../utils/technicalIndicators');
const Helpers = require('../utils/helpers');

/**
 * Market Intelligence Service
 * Analyzes on-chain market conditions to determine optimal trading strategies
 */
class MarketIntelligence {
  constructor(jupiterService, connectionManager) {
    this.jupiterService = jupiterService;
    this.connectionManager = connectionManager;
    this.analysisCache = null;
    this.cacheTimestamp = null;
    this.cacheDuration = 300000; // 5 minutes
  }

  /**
   * Run comprehensive market analysis
   * @param {string} inputMint - Input token mint
   * @param {string} outputMint - Output token mint
   * @param {number} lookbackHours - Hours to analyze (default 8-10)
   */
  async analyzeMarket(inputMint, outputMint, lookbackHours = 8) {
    try {
      logger.info('Starting comprehensive market analysis...', {
        lookbackHours,
        inputMint: inputMint.substring(0, 8) + '...',
        outputMint: outputMint.substring(0, 8) + '...'
      });

      const analysis = {
        timestamp: Date.now(),
        lookbackHours,
        priceData: null,
        volumeData: null,
        volatility: null,
        trend: null,
        marketRegime: null,
        recommendedStrategy: null,
        confidence: 0
      };

      // Gather price data over time
      analysis.priceData = await this.gatherPriceHistory(inputMint, outputMint, lookbackHours);

      // Analyze volume patterns
      analysis.volumeData = await this.analyzeVolume(inputMint, outputMint);

      // Calculate volatility
      analysis.volatility = this.calculateVolatility(analysis.priceData);

      // Detect trend
      analysis.trend = this.detectTrend(analysis.priceData);

      // Determine market regime
      analysis.marketRegime = this.determineMarketRegime(
        analysis.volatility,
        analysis.trend,
        analysis.volumeData
      );

      // Recommend strategy
      const recommendation = this.recommendStrategy(analysis);
      analysis.recommendedStrategy = recommendation.strategy;
      analysis.confidence = recommendation.confidence;

      logger.success('Market analysis complete', {
        regime: analysis.marketRegime,
        trend: analysis.trend,
        volatility: analysis.volatility.level,
        recommendedStrategy: analysis.recommendedStrategy,
        confidence: analysis.confidence + '%'
      });

      // Cache results
      this.analysisCache = analysis;
      this.cacheTimestamp = Date.now();

      return analysis;
    } catch (error) {
      logger.error('Market analysis failed', { error: error.message });
      // Return default conservative analysis
      return {
        timestamp: Date.now(),
        marketRegime: 'UNCERTAIN',
        recommendedStrategy: 'dca',
        confidence: 30
      };
    }
  }

  /**
   * Gather historical price data
   */
  async gatherPriceHistory(inputMint, outputMint, hours) {
    const prices = [];
    const intervals = Math.min(hours * 6, 60); // Sample every 10 minutes, max 60 samples
    const delayMs = 2000; // 2 seconds between requests

    logger.info(`Gathering ${intervals} price samples over ${hours} hours...`);

    // For now, we'll sample current prices as historical data isn't easily available
    // In production, you'd use a price API or maintain your own price history
    try {
      for (let i = 0; i < Math.min(intervals, 10); i++) {
        const priceData = await this.jupiterService.getPrice(inputMint, outputMint);
        prices.push(priceData.price);

        if (i < intervals - 1) {
          await Helpers.sleep(delayMs);
        }
      }

      logger.info(`Collected ${prices.length} price samples`);

      return {
        prices,
        high: Math.max(...prices),
        low: Math.min(...prices),
        current: prices[prices.length - 1],
        range: Math.max(...prices) - Math.min(...prices),
        samples: prices.length
      };
    } catch (error) {
      logger.error('Failed to gather price history', { error: error.message });
      return { prices: [], high: 0, low: 0, current: 0, range: 0, samples: 0 };
    }
  }

  /**
   * Analyze trading volume
   */
  async analyzeVolume(inputMint, outputMint) {
    try {
      // In production, you'd query actual volume data from DEX APIs
      // For now, we'll use quote size as a proxy for liquidity
      const quote = await this.jupiterService.getQuote(
        inputMint,
        outputMint,
        1e9, // 1 SOL
        50
      );

      const priceImpact = parseFloat(quote.priceImpactPct || '0');

      return {
        priceImpact,
        liquidityLevel: this.categorizeLiquidity(priceImpact),
        suitable: priceImpact < 2.0 // Less than 2% impact is good
      };
    } catch (error) {
      logger.error('Volume analysis failed', { error: error.message });
      return {
        priceImpact: 10,
        liquidityLevel: 'LOW',
        suitable: false
      };
    }
  }

  /**
   * Categorize liquidity based on price impact
   */
  categorizeLiquidity(priceImpact) {
    if (priceImpact < 0.5) return 'VERY_HIGH';
    if (priceImpact < 1.0) return 'HIGH';
    if (priceImpact < 2.0) return 'MEDIUM';
    if (priceImpact < 5.0) return 'LOW';
    return 'VERY_LOW';
  }

  /**
   * Calculate volatility metrics
   */
  calculateVolatility(priceData) {
    if (!priceData.prices || priceData.prices.length < 2) {
      return {
        value: 0,
        level: 'UNKNOWN',
        percentile: 0
      };
    }

    const prices = priceData.prices;
    const returns = [];

    // Calculate returns
    for (let i = 1; i < prices.length; i++) {
      const returnPct = ((prices[i] - prices[i - 1]) / prices[i - 1]) * 100;
      returns.push(returnPct);
    }

    // Calculate standard deviation
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Annualized volatility (approximate)
    const annualizedVol = stdDev * Math.sqrt(365 * 24 * 6); // 6 samples per hour

    let level = 'MEDIUM';
    if (annualizedVol < 30) level = 'LOW';
    else if (annualizedVol < 60) level = 'MEDIUM';
    else if (annualizedVol < 100) level = 'HIGH';
    else level = 'VERY_HIGH';

    return {
      value: annualizedVol,
      level,
      stdDev,
      priceRange: ((priceData.high - priceData.low) / priceData.low) * 100
    };
  }

  /**
   * Detect market trend
   */
  detectTrend(priceData) {
    if (!priceData.prices || priceData.prices.length < 5) {
      return 'UNKNOWN';
    }

    const prices = priceData.prices;

    // Use technical indicators
    const trend = TechnicalIndicators.detectTrend(prices);

    // Calculate momentum
    const firstHalf = prices.slice(0, Math.floor(prices.length / 2));
    const secondHalf = prices.slice(Math.floor(prices.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const momentum = ((secondAvg - firstAvg) / firstAvg) * 100;

    return {
      direction: trend,
      momentum: momentum.toFixed(2),
      strength: Math.abs(momentum) > 2 ? 'STRONG' : Math.abs(momentum) > 0.5 ? 'MODERATE' : 'WEAK'
    };
  }

  /**
   * Determine overall market regime
   */
  determineMarketRegime(volatility, trend, volume) {
    // High volatility + strong trend = TRENDING
    if (volatility.level === 'HIGH' || volatility.level === 'VERY_HIGH') {
      if (trend.strength === 'STRONG') {
        return 'TRENDING';
      }
      return 'VOLATILE_RANGING';
    }

    // Low volatility + weak trend = RANGING
    if (volatility.level === 'LOW' && trend.strength === 'WEAK') {
      return 'CALM_RANGING';
    }

    // Moderate conditions
    if (trend.strength === 'MODERATE' || trend.strength === 'STRONG') {
      return 'TRENDING';
    }

    return 'RANGING';
  }

  /**
   * Recommend optimal strategy based on market conditions
   */
  recommendStrategy(analysis) {
    const { marketRegime, volatility, trend, volumeData } = analysis;

    let strategy = 'dca'; // Default conservative
    let confidence = 50;
    let reasoning = '';

    // Trending markets = Momentum strategy
    if (marketRegime === 'TRENDING' && trend.strength === 'STRONG') {
      strategy = 'momentum';
      confidence = 75;
      reasoning = 'Strong trend detected with clear momentum';

      if (volumeData.liquidityLevel === 'HIGH' || volumeData.liquidityLevel === 'VERY_HIGH') {
        confidence = 85;
        reasoning += ', high liquidity supports momentum trading';
      }
    }

    // Ranging markets with high volatility = Grid trading
    else if (
      (marketRegime === 'RANGING' || marketRegime === 'VOLATILE_RANGING') &&
      volatility.level !== 'LOW'
    ) {
      strategy = 'grid';
      confidence = 70;
      reasoning = 'Ranging market with volatility suits grid trading';

      if (volatility.level === 'HIGH' || volatility.level === 'VERY_HIGH') {
        confidence = 80;
        reasoning += ', high volatility increases grid profitability';
      }
    }

    // Calm, low volatility markets = DCA or Threshold
    else if (marketRegime === 'CALM_RANGING') {
      strategy = 'dca';
      confidence = 60;
      reasoning = 'Calm market conditions favor accumulation';
    }

    // Uncertain conditions = DCA
    else {
      strategy = 'dca';
      confidence = 50;
      reasoning = 'Uncertain market conditions, using conservative DCA';
    }

    return {
      strategy,
      confidence,
      reasoning,
      alternatives: this.getAlternativeStrategies(strategy, marketRegime)
    };
  }

  /**
   * Get alternative strategies
   */
  getAlternativeStrategies(primary, regime) {
    const alternatives = [];

    if (primary !== 'momentum') {
      alternatives.push({
        strategy: 'momentum',
        suitability: regime === 'TRENDING' ? 'HIGH' : 'LOW'
      });
    }

    if (primary !== 'grid') {
      alternatives.push({
        strategy: 'grid',
        suitability: regime.includes('RANGING') ? 'HIGH' : 'LOW'
      });
    }

    if (primary !== 'dca') {
      alternatives.push({
        strategy: 'dca',
        suitability: 'MEDIUM'
      });
    }

    return alternatives;
  }

  /**
   * Get cached analysis if still valid
   */
  getCachedAnalysis() {
    if (
      this.analysisCache &&
      this.cacheTimestamp &&
      Date.now() - this.cacheTimestamp < this.cacheDuration
    ) {
      logger.info('Using cached market analysis');
      return this.analysisCache;
    }
    return null;
  }

  /**
   * Generate market report
   */
  generateReport(analysis) {
    if (!analysis) return 'No analysis available';

    const report = `
╔════════════════════════════════════════════════════════════╗
║           MARKET INTELLIGENCE REPORT                       ║
╠════════════════════════════════════════════════════════════╣
║ Market Regime: ${analysis.marketRegime?.padEnd(40)}║
║ Trend: ${(analysis.trend?.direction + ' (' + analysis.trend?.strength + ')').padEnd(47)}║
║ Volatility: ${(analysis.volatility?.level + ' (' + analysis.volatility?.value?.toFixed(1) + '%)').padEnd(45)}║
║ Liquidity: ${analysis.volumeData?.liquidityLevel?.padEnd(46)}║
╠════════════════════════════════════════════════════════════╣
║ RECOMMENDED STRATEGY: ${analysis.recommendedStrategy?.toUpperCase().padEnd(33)}║
║ Confidence: ${(analysis.confidence + '%').padEnd(45)}║
║ Reasoning: ${(analysis.reasoning || 'N/A').substring(0, 44).padEnd(44)}║
╚════════════════════════════════════════════════════════════╝
    `;

    return report;
  }
}

module.exports = MarketIntelligence;
