const logger = require('../utils/logger');

/**
 * SIGNAL FUSION SYSTEM
 *
 * Collects signals from all intelligence sources and fuses them into
 * a unified recommendation:
 *
 * Sources:
 * - Technical Analysis (RSI, MACD, Support/Resistance)
 * - Trade Predictions (Pattern recognition)
 * - Market Intelligence (Regime detection)
 * - KOL Monitor (Manipulation detection)
 * - MEV Detector (Front-running risks)
 * - Manipulation Detector (Pump & dump schemes)
 * - Flash Crash Protector (Liquidity risks)
 *
 * Output: Unified signal with confidence score for Decision Engine
 */

class SignalFusion {
  constructor(components) {
    this.components = components;

    // Signal source weights
    this.sourceWeights = {
      technicalAnalysis: 0.25,
      tradePrediction: 0.25,
      marketIntelligence: 0.20,
      kolMonitor: 0.15,        // Negative weight (warnings)
      mevDetector: 0.08,        // Negative weight (risks)
      manipulationDetector: 0.07 // Negative weight (risks)
    };

    logger.info('Signal Fusion initialized', {
      sources: Object.keys(this.sourceWeights).length
    });
  }

  /**
   * Collect and fuse all signals for a token
   *
   * @param {string} token - Token address
   * @param {Object} marketData - Current market data
   * @returns {Object} - Fused signal for Decision Engine
   */
  async fuseSignals(token, marketData) {
    try {
      logger.debug('Fusing signals', { token });

      // Collect signals from all sources in parallel
      const [
        technical,
        prediction,
        intelligence,
        kolAlert,
        mevRisk,
        manipulation
      ] = await Promise.all([
        this.getTechnicalSignal(token, marketData),
        this.getPredictionSignal(token, marketData),
        this.getIntelligenceSignal(token, marketData),
        this.getKOLSignal(token),
        this.getMEVSignal(token, marketData),
        this.getManipulationSignal(token, marketData)
      ]);

      // Fuse into unified signal
      const fusedSignal = {
        token: token,
        timestamp: Date.now(),

        // Technical indicators
        technical: {
          rsi: technical.rsi,
          macd: technical.macd,
          trend: technical.trend,
          nearSupport: technical.nearSupport,
          nearResistance: technical.nearResistance,
          support: technical.support,
          resistance: technical.resistance
        },

        // Sentiment and momentum
        sentiment: {
          overall: intelligence.sentiment || 'NEUTRAL',
          volumeTrend: technical.volumeTrend || 'STABLE',
          momentum: technical.momentum || 'NEUTRAL'
        },

        // Market regime
        regime: intelligence.regime || 'RANGING',
        strategy: prediction.type || 'WAIT',

        // Risk factors
        risk: {
          kolCoordination: kolAlert.kolCount || 0,
          mevRisk: mevRisk.level || 'LOW',
          manipulationDetected: manipulation.detected || false,
          flashCrashRisk: marketData.flashCrashRisk || 'LOW',
          deployerScore: kolAlert.deployerScore || 100
        },

        // Timing factors
        timing: {
          spread: marketData.spread || 0,
          liquidityDepth: marketData.liquidity || 0,
          recentVolatility: marketData.volatility > 0.15 ? 'VOLATILE' : 'STABLE'
        },

        // Execution parameters from prediction
        direction: prediction.direction || 'LONG',
        entry: prediction.entry || marketData.price,
        stopLoss: prediction.stopLoss || marketData.price * 0.98,
        takeProfit: prediction.takeProfit || marketData.price * 1.04,
        timeframe: prediction.timeframe || '1h',

        // Overall confidence
        confidence: this.calculateOverallConfidence({
          technical,
          prediction,
          intelligence,
          kolAlert,
          mevRisk,
          manipulation
        }),

        // Market context
        price: marketData.price,
        liquidity: marketData.liquidity,
        volatility: marketData.volatility,

        // Raw signals for audit trail
        raw: {
          technical,
          prediction,
          intelligence,
          kolAlert,
          mevRisk,
          manipulation
        }
      };

      logger.info('Signals fused', {
        token: token,
        confidence: fusedSignal.confidence.toFixed(2),
        strategy: fusedSignal.strategy,
        regime: fusedSignal.regime,
        risks: fusedSignal.risk.kolCoordination > 0 ? 'DETECTED' : 'CLEAR'
      });

      return fusedSignal;

    } catch (error) {
      logger.error('Signal fusion failed:', error);
      throw error;
    }
  }

  /**
   * Get technical analysis signal
   */
  async getTechnicalSignal(token, marketData) {
    if (!this.components.technicalIndicators) {
      return this.getDefaultTechnicalSignal();
    }

    try {
      const { TechnicalIndicators } = require('../utils/technicalIndicators');

      // Calculate indicators from price history
      const closes = marketData.priceHistory.map(p => p.close);
      const highs = marketData.priceHistory.map(p => p.high);
      const lows = marketData.priceHistory.map(p => p.low);

      const rsi = TechnicalIndicators.calculateRSI(closes, 14);
      const macd = TechnicalIndicators.calculateMACD(closes);

      // Determine trend
      const ema20 = TechnicalIndicators.calculateEMA(closes, 20);
      const ema50 = TechnicalIndicators.calculateEMA(closes, 50);
      const trend = ema20 > ema50 ? 'UPTREND' : 'DOWNTREND';

      // Find support/resistance
      const support = this.findNearestSupport(marketData.priceHistory, marketData.price);
      const resistance = this.findNearestResistance(marketData.priceHistory, marketData.price);

      return {
        rsi: rsi || 50,
        macd: macd || { macd: 0, signal: 0, histogram: 0 },
        trend: trend,
        ema20: ema20,
        ema50: ema50,
        support: support,
        resistance: resistance,
        nearSupport: Math.abs(marketData.price - support) / marketData.price < 0.02,
        nearResistance: Math.abs(resistance - marketData.price) / marketData.price < 0.02,
        volumeTrend: this.analyzeVolumeTrend(marketData.priceHistory),
        momentum: this.analyzeMomentum(rsi, macd)
      };

    } catch (error) {
      logger.error('Technical signal error:', error);
      return this.getDefaultTechnicalSignal();
    }
  }

  /**
   * Get trade prediction signal
   */
  async getPredictionSignal(token, marketData) {
    if (!this.components.tradePrediction) {
      return { type: 'WAIT', confidence: 0.5 };
    }

    try {
      const predictions = await this.components.tradePrediction.predictTrades(
        marketData.priceHistory,
        { maxPredictions: 1 }
      );

      if (predictions.length > 0) {
        return predictions[0];
      }

      return { type: 'WAIT', confidence: 0.5 };

    } catch (error) {
      logger.error('Prediction signal error:', error);
      return { type: 'WAIT', confidence: 0.5 };
    }
  }

  /**
   * Get market intelligence signal
   */
  async getIntelligenceSignal(token, marketData) {
    if (!this.components.marketIntelligence) {
      return { regime: 'RANGING', sentiment: 'NEUTRAL' };
    }

    try {
      const regime = await this.components.marketIntelligence.detectMarketRegime(marketData);
      const sentiment = await this.components.marketIntelligence.analyzeSentiment(marketData);

      return {
        regime: regime,
        sentiment: sentiment
      };

    } catch (error) {
      logger.error('Intelligence signal error:', error);
      return { regime: 'RANGING', sentiment: 'NEUTRAL' };
    }
  }

  /**
   * Get KOL monitoring signal (warnings)
   */
  async getKOLSignal(token) {
    if (!this.components.kolMonitor) {
      return { kolCount: 0, deployerScore: 100 };
    }

    try {
      const coordination = await this.components.kolMonitor.checkToken(token);

      return {
        kolCount: coordination?.kolCount || 0,
        suspicion: coordination?.suspicionLevel || 'NONE',
        deployerScore: coordination?.deployerScore || 100
      };

    } catch (error) {
      logger.error('KOL signal error:', error);
      return { kolCount: 0, deployerScore: 100 };
    }
  }

  /**
   * Get MEV risk signal
   */
  async getMEVSignal(token, marketData) {
    if (!this.components.mevDetector) {
      return { level: 'LOW' };
    }

    try {
      // Check if token is being targeted by MEV bots
      const risk = await this.components.mevDetector.assessRisk(token, marketData);

      return {
        level: risk.level || 'LOW',
        sandwichRisk: risk.sandwichRisk || false,
        frontRunRisk: risk.frontRunRisk || false
      };

    } catch (error) {
      logger.error('MEV signal error:', error);
      return { level: 'LOW' };
    }
  }

  /**
   * Get manipulation detection signal
   */
  async getManipulationSignal(token, marketData) {
    if (!this.components.manipulationDetector) {
      return { detected: false };
    }

    try {
      const pump = await this.components.manipulationDetector.detectPumpAndDump(
        token,
        marketData.recentTrades,
        marketData.price
      );

      return {
        detected: pump !== null,
        type: pump?.type || null,
        phase: pump?.phase || null,
        confidence: pump?.confidence || 0
      };

    } catch (error) {
      logger.error('Manipulation signal error:', error);
      return { detected: false };
    }
  }

  /**
   * Calculate overall confidence score
   */
  calculateOverallConfidence(signals) {
    let confidence = 0.5; // Start neutral

    // Positive signals increase confidence
    if (signals.technical.rsi < 30) confidence += 0.15;
    if (signals.technical.nearSupport) confidence += 0.10;
    if (signals.intelligence.sentiment === 'BULLISH') confidence += 0.10;
    if (signals.prediction.confidence) confidence += (signals.prediction.confidence / 100) * 0.20;

    // Negative signals decrease confidence
    if (signals.kolAlert.kolCount >= 3) confidence -= 0.25;
    if (signals.manipulation.detected) confidence -= 0.30;
    if (signals.mevRisk.level === 'HIGH') confidence -= 0.15;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Helper: Find nearest support
   */
  findNearestSupport(priceHistory, currentPrice) {
    const lows = priceHistory.map(p => p.low);
    const supportLevels = lows.filter(l => l < currentPrice);

    if (supportLevels.length === 0) {
      return currentPrice * 0.95; // Default 5% below
    }

    return Math.max(...supportLevels);
  }

  /**
   * Helper: Find nearest resistance
   */
  findNearestResistance(priceHistory, currentPrice) {
    const highs = priceHistory.map(p => p.high);
    const resistanceLevels = highs.filter(h => h > currentPrice);

    if (resistanceLevels.length === 0) {
      return currentPrice * 1.05; // Default 5% above
    }

    return Math.min(...resistanceLevels);
  }

  /**
   * Helper: Analyze volume trend
   */
  analyzeVolumeTrend(priceHistory) {
    const recentVolumes = priceHistory.slice(-10).map(p => p.volume);
    const olderVolumes = priceHistory.slice(-20, -10).map(p => p.volume);

    const recentAvg = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
    const olderAvg = olderVolumes.reduce((a, b) => a + b, 0) / olderVolumes.length;

    if (recentAvg > olderAvg * 1.2) return 'INCREASING';
    if (recentAvg < olderAvg * 0.8) return 'DECREASING';
    return 'STABLE';
  }

  /**
   * Helper: Analyze momentum
   */
  analyzeMomentum(rsi, macd) {
    if (rsi > 70 && macd.histogram > 0) return 'STRONG_BULLISH';
    if (rsi < 30 && macd.histogram < 0) return 'STRONG_BEARISH';
    if (rsi > 50 && macd.histogram > 0) return 'BULLISH';
    if (rsi < 50 && macd.histogram < 0) return 'BEARISH';
    return 'NEUTRAL';
  }

  /**
   * Default technical signal (when no data available)
   */
  getDefaultTechnicalSignal() {
    return {
      rsi: 50,
      macd: { macd: 0, signal: 0, histogram: 0 },
      trend: 'RANGING',
      support: 0,
      resistance: 0,
      nearSupport: false,
      nearResistance: false,
      volumeTrend: 'STABLE',
      momentum: 'NEUTRAL'
    };
  }
}

module.exports = SignalFusion;
