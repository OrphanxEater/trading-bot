/**
 * Kalman Filter Implementation
 * Used for pairs trading to estimate the "true" price relationship between correlated assets
 * Filters out noise and identifies mean-reverting opportunities
 */
class KalmanFilter {
  constructor(config = {}) {
    // State variables
    this.x = config.initialState || 0; // State estimate (spread)
    this.P = config.initialCovariance || 1; // Error covariance

    // Model parameters
    this.Q = config.processNoise || 0.0001; // Process noise covariance
    this.R = config.measurementNoise || 0.1; // Measurement noise covariance
    this.A = config.stateTransition || 1; // State transition
    this.H = config.measurementMatrix || 1; // Measurement matrix

    // History
    this.history = [];
    this.maxHistory = 1000;
  }

  /**
   * Update filter with new measurement
   * @param {number} measurement - New observed value
   * @returns {object} - Updated state estimate and confidence
   */
  update(measurement) {
    // Prediction step
    const x_pred = this.A * this.x;
    const P_pred = this.A * this.P * this.A + this.Q;

    // Update step
    const y = measurement - this.H * x_pred; // Innovation (measurement residual)
    const S = this.H * P_pred * this.H + this.R; // Innovation covariance
    const K = P_pred * this.H / S; // Kalman gain

    // Update estimates
    this.x = x_pred + K * y;
    this.P = (1 - K * this.H) * P_pred;

    // Store history
    this.history.push({
      timestamp: Date.now(),
      measurement,
      estimate: this.x,
      covariance: this.P,
      innovation: y,
      kalmanGain: K
    });

    // Trim history
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return {
      estimate: this.x,
      covariance: this.P,
      innovation: y,
      kalmanGain: K,
      confidence: 1 / (1 + this.P) // Higher when covariance is low
    };
  }

  /**
   * Get current state estimate
   */
  getEstimate() {
    return this.x;
  }

  /**
   * Get estimation confidence (0-1)
   */
  getConfidence() {
    return 1 / (1 + this.P);
  }

  /**
   * Get innovation (measurement vs prediction difference)
   */
  getLastInnovation() {
    if (this.history.length === 0) return 0;
    return this.history[this.history.length - 1].innovation;
  }

  /**
   * Calculate z-score of current measurement vs estimate
   */
  getZScore(measurement) {
    const innovation = measurement - this.x;
    const stdDev = Math.sqrt(this.P + this.R);
    return innovation / stdDev;
  }

  /**
   * Reset filter
   */
  reset(initialState = 0) {
    this.x = initialState;
    this.P = 1;
    this.history = [];
  }

  /**
   * Get statistics from history
   */
  getStatistics() {
    if (this.history.length < 2) {
      return {
        mean: this.x,
        stdDev: Math.sqrt(this.P),
        samples: this.history.length
      };
    }

    const estimates = this.history.map(h => h.estimate);
    const mean = estimates.reduce((a, b) => a + b, 0) / estimates.length;

    const squaredDiffs = estimates.map(e => Math.pow(e - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / estimates.length;
    const stdDev = Math.sqrt(variance);

    return {
      mean,
      stdDev,
      current: this.x,
      covariance: this.P,
      samples: this.history.length,
      confidence: this.getConfidence()
    };
  }
}

/**
 * Pairs Trading Kalman Filter
 * Specialized for tracking spread between two correlated assets
 */
class PairsTradingKalman extends KalmanFilter {
  constructor(config = {}) {
    super({
      initialState: config.initialSpread || 0,
      initialCovariance: config.initialCovariance || 1,
      processNoise: config.processNoise || 0.0001,
      measurementNoise: config.measurementNoise || 0.01,
      ...config
    });

    this.hedgeRatio = config.hedgeRatio || 1;
    this.spreadHistory = [];
  }

  /**
   * Update with prices of both assets
   * @param {number} priceA - Price of asset A
   * @param {number} priceB - Price of asset B
   */
  updatePrices(priceA, priceB) {
    // Calculate spread: A - hedge_ratio * B
    const spread = priceA - this.hedgeRatio * priceB;

    // Update Kalman filter
    const result = this.update(spread);

    // Store spread history
    this.spreadHistory.push({
      timestamp: Date.now(),
      priceA,
      priceB,
      spread,
      estimate: result.estimate
    });

    if (this.spreadHistory.length > this.maxHistory) {
      this.spreadHistory.shift();
    }

    return {
      ...result,
      spread,
      priceA,
      priceB,
      hedgeRatio: this.hedgeRatio
    };
  }

  /**
   * Update hedge ratio based on regression
   */
  updateHedgeRatio() {
    if (this.spreadHistory.length < 20) {
      return this.hedgeRatio; // Need more data
    }

    const recent = this.spreadHistory.slice(-100);
    const pricesA = recent.map(h => h.priceA);
    const pricesB = recent.map(h => h.priceB);

    // Calculate optimal hedge ratio using linear regression
    this.hedgeRatio = this.calculateHedgeRatio(pricesA, pricesB);

    return this.hedgeRatio;
  }

  /**
   * Calculate hedge ratio using linear regression
   */
  calculateHedgeRatio(pricesA, pricesB) {
    const n = pricesA.length;

    const meanA = pricesA.reduce((a, b) => a + b, 0) / n;
    const meanB = pricesB.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (pricesA[i] - meanA) * (pricesB[i] - meanB);
      denominator += Math.pow(pricesB[i] - meanB, 2);
    }

    return denominator === 0 ? 1 : numerator / denominator;
  }

  /**
   * Get trading signal based on z-score
   * @param {number} entryThreshold - Z-score to enter (default 2.0)
   * @param {number} exitThreshold - Z-score to exit (default 0.5)
   */
  getTradingSignal(currentSpread, entryThreshold = 2.0, exitThreshold = 0.5) {
    const zScore = this.getZScore(currentSpread);
    const stats = this.getStatistics();

    let signal = 'NEUTRAL';
    let strength = Math.abs(zScore);
    let action = null;

    // Mean reversion signals
    if (zScore > entryThreshold) {
      signal = 'SHORT_SPREAD'; // Spread too high, expect reversion
      action = {
        assetA: 'SELL',
        assetB: 'BUY',
        confidence: Math.min(strength / 3, 1) // Cap at 1
      };
    } else if (zScore < -entryThreshold) {
      signal = 'LONG_SPREAD'; // Spread too low, expect reversion
      action = {
        assetA: 'BUY',
        assetB: 'SELL',
        confidence: Math.min(strength / 3, 1)
      };
    } else if (Math.abs(zScore) < exitThreshold) {
      signal = 'EXIT'; // Close to mean, exit positions
      action = {
        assetA: 'FLATTEN',
        assetB: 'FLATTEN',
        confidence: 1 - Math.abs(zScore) / exitThreshold
      };
    }

    return {
      signal,
      zScore: zScore.toFixed(3),
      strength,
      action,
      spread: currentSpread,
      estimate: this.x,
      stdDev: stats.stdDev,
      confidence: this.getConfidence()
    };
  }

  /**
   * Calculate correlation coefficient
   */
  getCorrelation() {
    if (this.spreadHistory.length < 20) {
      return null;
    }

    const recent = this.spreadHistory.slice(-100);
    const pricesA = recent.map(h => h.priceA);
    const pricesB = recent.map(h => h.priceB);

    const n = pricesA.length;
    const meanA = pricesA.reduce((a, b) => a + b, 0) / n;
    const meanB = pricesB.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let varA = 0;
    let varB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = pricesA[i] - meanA;
      const diffB = pricesB[i] - meanB;
      numerator += diffA * diffB;
      varA += diffA * diffA;
      varB += diffB * diffB;
    }

    const correlation = numerator / Math.sqrt(varA * varB);

    return {
      correlation,
      isCointegrated: Math.abs(correlation) > 0.7, // Rule of thumb
      hedgeRatio: this.hedgeRatio
    };
  }
}

module.exports = {
  KalmanFilter,
  PairsTradingKalman
};
