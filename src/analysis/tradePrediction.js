const logger = require('../utils/logger');
const TechnicalIndicators = require('../utils/technicalIndicators');

/**
 * TRADE PREDICTION ENGINE
 *
 * Analyzes market conditions and identifies high-probability trade setups
 * for the upcoming period based on:
 * - Technical patterns
 * - Support/resistance levels
 * - Momentum indicators
 * - Market structure
 * - Historical probability
 */

class TradePrediction {
  constructor(config) {
    this.config = config;

    // Pattern recognition confidence thresholds
    this.minConfidence = config.minPredictionConfidence || 0.65;

    logger.info('Trade Prediction Engine initialized');
  }

  /**
   * Analyze market data and predict trade setups for upcoming period
   *
   * @param {Array} historicalData - Recent OHLCV candles
   * @param {Object} options - Prediction options
   * @returns {Array} - Predicted trade setups with entry, stop, target
   */
  async predictTrades(historicalData, options = {}) {
    try {
      logger.info('Analyzing market for trade predictions', {
        candles: historicalData.length,
        timeframe: options.timeframe || '1h'
      });

      const predictions = [];

      // 1. Identify market structure
      const structure = this.analyzeMarketStructure(historicalData);

      // 2. Find key levels
      const levels = this.identifyKeyLevels(historicalData);

      // 3. Calculate technical indicators
      const technicals = this.calculateTechnicals(historicalData);

      // 4. Detect chart patterns
      const patterns = this.detectPatterns(historicalData);

      // 5. Analyze momentum and trend
      const momentum = this.analyzeMomentum(historicalData, technicals);

      logger.info('Market analysis complete', {
        trend: structure.trend,
        keyLevels: levels.support.length + levels.resistance.length,
        patterns: patterns.length,
        momentum: momentum.state
      });

      // Generate trade predictions based on analysis

      // PREDICTION 1: Support/Resistance Bounces
      const bounceSetups = this.predictBounceSetups(levels, structure, technicals, momentum);
      predictions.push(...bounceSetups);

      // PREDICTION 2: Breakout Trades
      const breakoutSetups = this.predictBreakoutSetups(levels, structure, technicals, momentum);
      predictions.push(...breakoutSetups);

      // PREDICTION 3: Trend Continuation
      const trendSetups = this.predictTrendContinuation(structure, technicals, momentum);
      predictions.push(...trendSetups);

      // PREDICTION 4: Reversal Setups
      const reversalSetups = this.predictReversals(historicalData, technicals, patterns);
      predictions.push(...reversalSetups);

      // PREDICTION 5: Scalp Opportunities
      const scalpSetups = this.predictScalpSetups(historicalData, technicals, momentum);
      predictions.push(...scalpSetups);

      // Filter by confidence and sort
      // Lower threshold if no high-confidence setups found
      let filteredPredictions = predictions
        .filter(p => p.confidence >= this.minConfidence)
        .sort((a, b) => b.confidence - a.confidence);

      // If we don't have enough predictions, lower confidence threshold
      if (filteredPredictions.length < (options.maxPredictions || 5)) {
        filteredPredictions = predictions
          .filter(p => p.confidence >= 0.50) // Accept 50%+ confidence
          .sort((a, b) => b.confidence - a.confidence);
      }

      // Take top N predictions
      filteredPredictions = filteredPredictions.slice(0, options.maxPredictions || 5);

      logger.success('Trade predictions generated', {
        total: filteredPredictions.length,
        avgConfidence: (filteredPredictions.reduce((sum, p) => sum + p.confidence, 0) / filteredPredictions.length * 100).toFixed(1) + '%'
      });

      return filteredPredictions;

    } catch (error) {
      logger.error('Trade prediction error:', error);
      return [];
    }
  }

  /**
   * Analyze overall market structure
   */
  analyzeMarketStructure(data) {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

    // Identify swing highs and lows
    const swingHighs = this.findSwingPoints(highs, 'high');
    const swingLows = this.findSwingPoints(lows, 'low');

    // Determine trend
    let trend = 'RANGING';
    if (swingHighs.length >= 2 && swingLows.length >= 2) {
      const recentHighs = swingHighs.slice(-2);
      const recentLows = swingLows.slice(-2);

      const higherHighs = recentHighs[1].price > recentHighs[0].price;
      const higherLows = recentLows[1].price > recentLows[0].price;
      const lowerHighs = recentHighs[1].price < recentHighs[0].price;
      const lowerLows = recentLows[1].price < recentLows[0].price;

      if (higherHighs && higherLows) trend = 'UPTREND';
      else if (lowerHighs && lowerLows) trend = 'DOWNTREND';
    }

    // Calculate structure quality
    const structureQuality = this.calculateStructureQuality(swingHighs, swingLows);

    return {
      trend,
      swingHighs,
      swingLows,
      quality: structureQuality,
      currentPhase: this.identifyCurrentPhase(data)
    };
  }

  /**
   * Identify key support and resistance levels
   */
  identifyKeyLevels(data) {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);
    const volumes = data.map(d => d.volume);

    // Find volume-weighted price levels
    const priceLevels = new Map();

    for (let i = 0; i < data.length; i++) {
      const price = Math.round(closes[i] * 100) / 100;
      const volume = volumes[i];
      priceLevels.set(price, (priceLevels.get(price) || 0) + volume);
    }

    // Find significant levels (high volume)
    const sortedLevels = Array.from(priceLevels.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([price, volume]) => ({ price, strength: volume }));

    const currentPrice = closes[closes.length - 1];

    return {
      support: sortedLevels
        .filter(l => l.price < currentPrice)
        .sort((a, b) => b.price - a.price)
        .slice(0, 3),
      resistance: sortedLevels
        .filter(l => l.price > currentPrice)
        .sort((a, b) => a.price - b.price)
        .slice(0, 3),
      currentPrice
    };
  }

  /**
   * Calculate technical indicators
   */
  calculateTechnicals(data) {
    const closes = data.map(d => d.close);
    const highs = data.map(d => d.high);
    const lows = data.map(d => d.low);

    // Calculate array-based indicators
    const rsiArray = this.calculateRSIArray(closes, 14);
    const emaArray20 = this.calculateEMAArray(closes, 20);
    const emaArray50 = this.calculateEMAArray(closes, 50);
    const bbArray = this.calculateBollingerBandsArray(closes, 20, 2);
    const atrArray = this.calculateATRArray(highs, lows, closes, 14);
    const macdArray = this.calculateMACDArray(closes);

    return {
      rsi: rsiArray,
      macd: macdArray,
      bb: bbArray,
      ema20: emaArray20,
      ema50: emaArray50,
      atr: atrArray
    };
  }

  /**
   * Calculate RSI for all data points
   */
  calculateRSIArray(closes, period = 14) {
    const rsi = [];
    for (let i = period; i < closes.length; i++) {
      const slice = closes.slice(Math.max(0, i - 100), i + 1);
      const value = TechnicalIndicators.calculateRSI(slice, period);
      rsi.push(value || 50);
    }
    return rsi;
  }

  /**
   * Calculate EMA for all data points
   */
  calculateEMAArray(closes, period) {
    const ema = [];
    for (let i = period; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      const value = TechnicalIndicators.calculateEMA(slice, period);
      ema.push(value || closes[i]);
    }
    return ema;
  }

  /**
   * Calculate Bollinger Bands for all data points
   */
  calculateBollingerBandsArray(closes, period = 20, stdDev = 2) {
    const bb = [];
    for (let i = period; i < closes.length; i++) {
      const slice = closes.slice(i - period, i);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
      const std = Math.sqrt(variance);

      bb.push({
        upper: sma + (stdDev * std),
        middle: sma,
        lower: sma - (stdDev * std)
      });
    }
    return bb;
  }

  /**
   * Calculate ATR for all data points
   */
  calculateATRArray(highs, lows, closes, period = 14) {
    const atr = [];
    const tr = [];

    for (let i = 1; i < highs.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];

      const trueRange = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      tr.push(trueRange);
    }

    for (let i = period; i < tr.length; i++) {
      const slice = tr.slice(i - period, i);
      const avgTR = slice.reduce((a, b) => a + b, 0) / period;
      atr.push(avgTR);
    }

    return atr;
  }

  /**
   * Calculate MACD for all data points
   */
  calculateMACDArray(closes) {
    const macd = [];
    for (let i = 26; i < closes.length; i++) {
      const slice = closes.slice(0, i + 1);
      const value = TechnicalIndicators.calculateMACD(slice);
      macd.push(value || { macd: 0, signal: 0, histogram: 0 });
    }
    return macd;
  }

  /**
   * Detect chart patterns
   */
  detectPatterns(data) {
    const patterns = [];

    // Double Top/Bottom
    const doublePattern = this.detectDoubleTopBottom(data);
    if (doublePattern) patterns.push(doublePattern);

    // Head and Shoulders
    const hsPattern = this.detectHeadAndShoulders(data);
    if (hsPattern) patterns.push(hsPattern);

    // Triangles
    const trianglePattern = this.detectTriangle(data);
    if (trianglePattern) patterns.push(trianglePattern);

    return patterns;
  }

  /**
   * Analyze momentum
   */
  analyzeMomentum(data, technicals) {
    const rsi = technicals.rsi[technicals.rsi.length - 1];
    const macd = technicals.macd[technicals.macd.length - 1];
    const closes = data.map(d => d.close);
    const currentPrice = closes[closes.length - 1];
    const ema20 = technicals.ema20[technicals.ema20.length - 1];
    const ema50 = technicals.ema50[technicals.ema50.length - 1];

    let state = 'NEUTRAL';
    let strength = 0;

    // Bullish momentum
    if (rsi > 50 && macd.histogram > 0 && currentPrice > ema20 && ema20 > ema50) {
      state = 'BULLISH';
      strength = Math.min(1, (rsi - 50) / 30 + Math.abs(macd.histogram) / 10);
    }
    // Bearish momentum
    else if (rsi < 50 && macd.histogram < 0 && currentPrice < ema20 && ema20 < ema50) {
      state = 'BEARISH';
      strength = Math.min(1, (50 - rsi) / 30 + Math.abs(macd.histogram) / 10);
    }

    return {
      state,
      strength,
      rsi,
      macd: macd.histogram,
      trending: Math.abs(ema20 - ema50) / currentPrice > 0.02
    };
  }

  /**
   * PREDICTION STRATEGIES
   */

  /**
   * Predict support/resistance bounce trades
   */
  predictBounceSetups(levels, structure, technicals, momentum) {
    const setups = [];
    const currentPrice = levels.currentPrice;
    const atr = technicals.atr[technicals.atr.length - 1];

    // Support bounces (LONG)
    for (const support of levels.support) {
      const distance = (currentPrice - support.price) / currentPrice;

      // Only predict if price is approaching support (within 2%)
      if (distance > 0 && distance < 0.02) {
        const confidence = this.calculateBounceConfidence(
          support,
          structure,
          'LONG',
          momentum
        );

        if (confidence >= this.minConfidence) {
          setups.push({
            type: 'SUPPORT_BOUNCE',
            direction: 'LONG',
            entry: support.price * 1.001, // Slightly above support
            stopLoss: support.price - (atr * 1.5),
            takeProfit: support.price + (atr * 3),
            confidence,
            reasoning: `Strong support at ${support.price.toFixed(2)}, price approaching`,
            timeframe: '4h-1d',
            riskReward: 2.0
          });
        }
      }
    }

    // Resistance bounces (SHORT)
    for (const resistance of levels.resistance) {
      const distance = (resistance.price - currentPrice) / currentPrice;

      if (distance > 0 && distance < 0.02) {
        const confidence = this.calculateBounceConfidence(
          resistance,
          structure,
          'SHORT',
          momentum
        );

        if (confidence >= this.minConfidence) {
          setups.push({
            type: 'RESISTANCE_BOUNCE',
            direction: 'SHORT',
            entry: resistance.price * 0.999,
            stopLoss: resistance.price + (atr * 1.5),
            takeProfit: resistance.price - (atr * 3),
            confidence,
            reasoning: `Strong resistance at ${resistance.price.toFixed(2)}, price approaching`,
            timeframe: '4h-1d',
            riskReward: 2.0
          });
        }
      }
    }

    return setups;
  }

  /**
   * Predict breakout trades
   */
  predictBreakoutSetups(levels, structure, technicals, momentum) {
    const setups = [];
    const currentPrice = levels.currentPrice;
    const atr = technicals.atr[technicals.atr.length - 1];

    // Bullish breakouts
    if (levels.resistance.length > 0 && momentum.state === 'BULLISH') {
      const nearestResistance = levels.resistance[0];
      const distance = (nearestResistance.price - currentPrice) / currentPrice;

      if (distance > 0 && distance < 0.01) {
        setups.push({
          type: 'BREAKOUT',
          direction: 'LONG',
          entry: nearestResistance.price * 1.002, // Above resistance
          stopLoss: nearestResistance.price - (atr * 2),
          takeProfit: nearestResistance.price + (atr * 4),
          confidence: 0.70 + (momentum.strength * 0.15),
          reasoning: `Bullish momentum approaching resistance at ${nearestResistance.price.toFixed(2)}`,
          timeframe: '1h-4h',
          riskReward: 2.0
        });
      }
    }

    // Bearish breakdowns
    if (levels.support.length > 0 && momentum.state === 'BEARISH') {
      const nearestSupport = levels.support[0];
      const distance = (currentPrice - nearestSupport.price) / currentPrice;

      if (distance > 0 && distance < 0.01) {
        setups.push({
          type: 'BREAKDOWN',
          direction: 'SHORT',
          entry: nearestSupport.price * 0.998,
          stopLoss: nearestSupport.price + (atr * 2),
          takeProfit: nearestSupport.price - (atr * 4),
          confidence: 0.70 + (momentum.strength * 0.15),
          reasoning: `Bearish momentum approaching support at ${nearestSupport.price.toFixed(2)}`,
          timeframe: '1h-4h',
          riskReward: 2.0
        });
      }
    }

    return setups;
  }

  /**
   * Predict trend continuation trades
   */
  predictTrendContinuation(structure, technicals, momentum) {
    const setups = [];

    if (structure.trend === 'UPTREND' && momentum.state === 'BULLISH' && momentum.trending) {
      const currentPrice = technicals.ema20[technicals.ema20.length - 1];
      const atr = technicals.atr[technicals.atr.length - 1];

      setups.push({
        type: 'TREND_CONTINUATION',
        direction: 'LONG',
        entry: currentPrice,
        stopLoss: technicals.ema50[technicals.ema50.length - 1],
        takeProfit: currentPrice + (atr * 5),
        confidence: 0.75 + (momentum.strength * 0.10),
        reasoning: 'Strong uptrend with bullish momentum',
        timeframe: '4h-1d',
        riskReward: 3.0
      });
    }

    if (structure.trend === 'DOWNTREND' && momentum.state === 'BEARISH' && momentum.trending) {
      const currentPrice = technicals.ema20[technicals.ema20.length - 1];
      const atr = technicals.atr[technicals.atr.length - 1];

      setups.push({
        type: 'TREND_CONTINUATION',
        direction: 'SHORT',
        entry: currentPrice,
        stopLoss: technicals.ema50[technicals.ema50.length - 1],
        takeProfit: currentPrice - (atr * 5),
        confidence: 0.75 + (momentum.strength * 0.10),
        reasoning: 'Strong downtrend with bearish momentum',
        timeframe: '4h-1d',
        riskReward: 3.0
      });
    }

    return setups;
  }

  /**
   * Predict reversal trades
   */
  predictReversals(data, technicals, patterns) {
    const setups = [];
    const rsi = technicals.rsi[technicals.rsi.length - 1];
    const currentPrice = data[data.length - 1].close;
    const atr = technicals.atr[technicals.atr.length - 1];

    // Oversold reversal (LONG)
    if (rsi < 30) {
      setups.push({
        type: 'REVERSAL',
        direction: 'LONG',
        entry: currentPrice,
        stopLoss: currentPrice - (atr * 2),
        takeProfit: currentPrice + (atr * 4),
        confidence: 0.65 + ((30 - rsi) / 100),
        reasoning: `Oversold RSI at ${rsi.toFixed(1)}, reversal likely`,
        timeframe: '1h-4h',
        riskReward: 2.0
      });
    }

    // Overbought reversal (SHORT)
    if (rsi > 70) {
      setups.push({
        type: 'REVERSAL',
        direction: 'SHORT',
        entry: currentPrice,
        stopLoss: currentPrice + (atr * 2),
        takeProfit: currentPrice - (atr * 4),
        confidence: 0.65 + ((rsi - 70) / 100),
        reasoning: `Overbought RSI at ${rsi.toFixed(1)}, reversal likely`,
        timeframe: '1h-4h',
        riskReward: 2.0
      });
    }

    return setups;
  }

  /**
   * Predict scalp opportunities
   */
  predictScalpSetups(data, technicals, momentum) {
    const setups = [];
    const currentPrice = data[data.length - 1].close;
    const bb = technicals.bb[technicals.bb.length - 1];
    const atr = technicals.atr[technicals.atr.length - 1];

    // Bollinger Band squeeze scalp (LONG)
    if (currentPrice <= bb.lower * 1.01 && momentum.rsi < 45) {
      setups.push({
        type: 'SCALP',
        direction: 'LONG',
        entry: currentPrice,
        stopLoss: currentPrice - (atr * 0.5),
        takeProfit: bb.middle,
        confidence: 0.68 + ((45 - momentum.rsi) / 100),
        reasoning: `Price near lower Bollinger Band ($${bb.lower.toFixed(2)}), mean reversion expected`,
        timeframe: '15m-1h',
        riskReward: 2.0
      });
    }

    // Bollinger Band squeeze scalp (SHORT)
    if (currentPrice >= bb.upper * 0.99 && momentum.rsi > 55) {
      setups.push({
        type: 'SCALP',
        direction: 'SHORT',
        entry: currentPrice,
        stopLoss: currentPrice + (atr * 0.5),
        takeProfit: bb.middle,
        confidence: 0.68 + ((momentum.rsi - 55) / 100),
        reasoning: `Price near upper Bollinger Band ($${bb.upper.toFixed(2)}), mean reversion expected`,
        timeframe: '15m-1h',
        riskReward: 2.0
      });
    }

    // RSI scalp setups
    if (momentum.rsi < 35) {
      setups.push({
        type: 'SCALP',
        direction: 'LONG',
        entry: currentPrice,
        stopLoss: currentPrice - (atr * 0.6),
        takeProfit: currentPrice + (atr * 1.5),
        confidence: 0.65 + ((35 - momentum.rsi) / 70),
        reasoning: `RSI oversold at ${momentum.rsi.toFixed(1)}, quick bounce expected`,
        timeframe: '15m-30m',
        riskReward: 2.5
      });
    }

    if (momentum.rsi > 65) {
      setups.push({
        type: 'SCALP',
        direction: 'SHORT',
        entry: currentPrice,
        stopLoss: currentPrice + (atr * 0.6),
        takeProfit: currentPrice - (atr * 1.5),
        confidence: 0.65 + ((momentum.rsi - 65) / 70),
        reasoning: `RSI overbought at ${momentum.rsi.toFixed(1)}, quick pullback expected`,
        timeframe: '15m-30m',
        riskReward: 2.5
      });
    }

    return setups;
  }

  // Helper methods

  findSwingPoints(prices, type) {
    const swings = [];
    const lookback = 5;

    for (let i = lookback; i < prices.length - lookback; i++) {
      let isSwing = true;

      if (type === 'high') {
        for (let j = i - lookback; j <= i + lookback; j++) {
          if (j !== i && prices[j] >= prices[i]) {
            isSwing = false;
            break;
          }
        }
      } else {
        for (let j = i - lookback; j <= i + lookback; j++) {
          if (j !== i && prices[j] <= prices[i]) {
            isSwing = false;
            break;
          }
        }
      }

      if (isSwing) {
        swings.push({ index: i, price: prices[i] });
      }
    }

    return swings;
  }

  calculateStructureQuality(swingHighs, swingLows) {
    if (swingHighs.length < 2 || swingLows.length < 2) return 0;

    // Quality based on clear swing points
    const totalSwings = swingHighs.length + swingLows.length;
    return Math.min(1, totalSwings / 20);
  }

  identifyCurrentPhase(data) {
    const recentData = data.slice(-20);
    const volatility = this.calculateVolatility(recentData.map(d => d.close));

    if (volatility > 0.03) return 'VOLATILE';
    if (volatility < 0.01) return 'CONSOLIDATION';
    return 'NORMAL';
  }

  calculateVolatility(prices) {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  calculateBounceConfidence(level, structure, direction, momentum) {
    let confidence = 0.60; // Base confidence

    // Strength of level
    confidence += Math.min(0.15, level.strength / 10000000);

    // Trend alignment
    if (direction === 'LONG' && structure.trend === 'UPTREND') confidence += 0.10;
    if (direction === 'SHORT' && structure.trend === 'DOWNTREND') confidence += 0.10;

    // Momentum alignment
    if (direction === 'LONG' && momentum.state === 'BULLISH') confidence += 0.05;
    if (direction === 'SHORT' && momentum.state === 'BEARISH') confidence += 0.05;

    return Math.min(0.95, confidence);
  }

  detectDoubleTopBottom(data) {
    // Simplified pattern detection
    return null;
  }

  detectHeadAndShoulders(data) {
    return null;
  }

  detectTriangle(data) {
    return null;
  }
}

module.exports = TradePrediction;
