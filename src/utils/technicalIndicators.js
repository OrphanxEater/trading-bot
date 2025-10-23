const BigNumber = require('bignumber.js');

/**
 * Technical Indicators
 * Implements common trading indicators for market analysis
 */
class TechnicalIndicators {
  /**
   * Calculate Simple Moving Average (SMA)
   * @param {Array<number>} prices - Array of prices
   * @param {number} period - Period for SMA
   */
  static calculateSMA(prices, period) {
    if (prices.length < period) {
      return null;
    }

    const slice = prices.slice(-period);
    const sum = slice.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   * @param {Array<number>} prices - Array of prices
   * @param {number} period - Period for EMA
   */
  static calculateEMA(prices, period) {
    if (prices.length < period) {
      return null;
    }

    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(prices.slice(0, period), period);

    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Calculate RSI (Relative Strength Index)
   * @param {Array<number>} prices - Array of prices
   * @param {number} period - Period for RSI (default 14)
   */
  static calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) {
      return null;
    }

    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

    if (avgLoss === 0) {
      return 100;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    return rsi;
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   * @param {Array<number>} prices - Array of prices
   * @param {number} fastPeriod - Fast EMA period (default 12)
   * @param {number} slowPeriod - Slow EMA period (default 26)
   * @param {number} signalPeriod - Signal line period (default 9)
   */
  static calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (prices.length < slowPeriod) {
      return null;
    }

    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);

    if (!fastEMA || !slowEMA) {
      return null;
    }

    const macdLine = fastEMA - slowEMA;

    // For signal line, we need MACD values over time
    // This is simplified - in practice, you'd maintain MACD history
    const signalLine = macdLine; // Simplified
    const histogram = macdLine - signalLine;

    return {
      macd: macdLine,
      signal: signalLine,
      histogram,
    };
  }

  /**
   * Calculate Bollinger Bands
   * @param {Array<number>} prices - Array of prices
   * @param {number} period - Period for moving average (default 20)
   * @param {number} stdDev - Standard deviation multiplier (default 2)
   */
  static calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (prices.length < period) {
      return null;
    }

    const sma = this.calculateSMA(prices, period);
    const slice = prices.slice(-period);

    // Calculate standard deviation
    const squaredDiffs = slice.map(price => Math.pow(price - sma, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    const upperBand = sma + (standardDeviation * stdDev);
    const lowerBand = sma - (standardDeviation * stdDev);

    return {
      upper: upperBand,
      middle: sma,
      lower: lowerBand,
      bandwidth: upperBand - lowerBand,
    };
  }

  /**
   * Calculate ATR (Average True Range)
   * @param {Array<object>} candles - Array of OHLC candles {high, low, close}
   * @param {number} period - Period for ATR (default 14)
   */
  static calculateATR(candles, period = 14) {
    if (candles.length < period + 1) {
      return null;
    }

    const trueRanges = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;

    return atr;
  }

  /**
   * Detect trend using moving averages
   * @param {Array<number>} prices - Array of prices
   */
  static detectTrend(prices) {
    const sma20 = this.calculateSMA(prices, 20);
    const sma50 = this.calculateSMA(prices, 50);
    const currentPrice = prices[prices.length - 1];

    if (!sma20 || !sma50) {
      return 'UNKNOWN';
    }

    // Strong uptrend
    if (currentPrice > sma20 && sma20 > sma50) {
      return 'UPTREND';
    }

    // Strong downtrend
    if (currentPrice < sma20 && sma20 < sma50) {
      return 'DOWNTREND';
    }

    // Sideways/ranging
    return 'SIDEWAYS';
  }

  /**
   * Generate trading signals based on RSI
   * @param {number} rsi - RSI value
   */
  static getRSISignal(rsi) {
    if (rsi < 30) {
      return { signal: 'BUY', strength: 'OVERSOLD', value: rsi };
    } else if (rsi > 70) {
      return { signal: 'SELL', strength: 'OVERBOUGHT', value: rsi };
    } else if (rsi < 40) {
      return { signal: 'BUY', strength: 'WEAK', value: rsi };
    } else if (rsi > 60) {
      return { signal: 'SELL', strength: 'WEAK', value: rsi };
    }
    return { signal: 'NEUTRAL', strength: 'NEUTRAL', value: rsi };
  }

  /**
   * Generate trading signals based on Bollinger Bands
   * @param {number} currentPrice - Current price
   * @param {object} bands - Bollinger Bands object
   */
  static getBollingerSignal(currentPrice, bands) {
    if (!bands) {
      return { signal: 'NEUTRAL', strength: 'UNKNOWN' };
    }

    const { upper, lower, middle } = bands;
    const upperDistance = (upper - currentPrice) / (upper - lower);
    const lowerDistance = (currentPrice - lower) / (upper - lower);

    if (currentPrice <= lower) {
      return { signal: 'BUY', strength: 'STRONG', reason: 'Price at lower band' };
    } else if (currentPrice >= upper) {
      return { signal: 'SELL', strength: 'STRONG', reason: 'Price at upper band' };
    } else if (lowerDistance < 0.3) {
      return { signal: 'BUY', strength: 'WEAK', reason: 'Price near lower band' };
    } else if (upperDistance < 0.3) {
      return { signal: 'SELL', strength: 'WEAK', reason: 'Price near upper band' };
    }

    return { signal: 'NEUTRAL', strength: 'NEUTRAL', reason: 'Price in middle range' };
  }

  /**
   * Calculate percentage change
   * @param {number} oldPrice - Old price
   * @param {number} newPrice - New price
   */
  static percentageChange(oldPrice, newPrice) {
    return ((newPrice - oldPrice) / oldPrice) * 100;
  }

  /**
   * Detect support and resistance levels
   * @param {Array<number>} prices - Historical prices
   * @param {number} threshold - Threshold for level detection (default 0.02 = 2%)
   */
  static detectSupportResistance(prices, threshold = 0.02) {
    const levels = [];
    const priceMap = {};

    // Group similar prices
    prices.forEach(price => {
      const roundedPrice = Math.round(price / (price * threshold)) * (price * threshold);
      priceMap[roundedPrice] = (priceMap[roundedPrice] || 0) + 1;
    });

    // Find significant levels (touched multiple times)
    Object.entries(priceMap).forEach(([price, count]) => {
      if (count >= 3) { // Touched at least 3 times
        levels.push({
          price: parseFloat(price),
          touches: count,
          type: price < prices[prices.length - 1] ? 'SUPPORT' : 'RESISTANCE'
        });
      }
    });

    return levels.sort((a, b) => b.touches - a.touches);
  }
}

module.exports = TechnicalIndicators;
