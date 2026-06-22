const logger = require('../utils/logger');

/**
 * CENTRAL DECISION ENGINE
 *
 * The "brain" of the trading bot that:
 * 1. Collects signals from all intelligence sources
 * 2. Weights and scores each signal
 * 3. Resolves conflicts between signals
 * 4. Calculates composite decision score
 * 5. Applies risk filters
 * 6. Makes final GO/WAIT/AVOID decision
 *
 * This is the CORE intelligence that determines what trades to make and when.
 */

class DecisionEngine {
  constructor(config) {
    this.config = config;

    // Signal weights (sum to 1.0)
    this.weights = {
      technical: 0.30,   // Technical indicators (RSI, MACD, support/resistance)
      sentiment: 0.20,   // Market sentiment and momentum
      regime: 0.20,      // Market regime alignment
      risk: 0.15,        // Risk assessment
      timing: 0.15       // Entry timing quality
    };

    // Decision thresholds
    this.thresholds = {
      strongBuy: 75,     // Execute immediately with full size
      buy: 60,           // Execute with confidence-adjusted size
      neutral: 40,       // Monitor or set limit order
      avoid: 0           // Do not trade
    };

    // Risk filters (hard limits)
    this.riskFilters = {
      maxKOLCoordination: 4,        // Max 4 KOLs, 5+ = manipulation
      minLiquidity: 100000,         // Min $100k liquidity
      maxVolatility: 0.20,          // Max 20% ATR/price
      maxPortfolioCorrelation: 0.7, // Max 0.7 correlation with existing
      maxPortfolioExposure: 0.80,   // Max 80% capital deployed
      minDeployerScore: 40          // Min 40/100 deployer reputation
    };

    logger.info('Decision Engine initialized', {
      weights: this.weights,
      thresholds: this.thresholds
    });
  }

  /**
   * Main decision-making function
   *
   * @param {Object} signals - All collected signals for a token
   * @param {Object} context - Current market context
   * @returns {Object} - Decision with action, confidence, sizing, timing
   */
  async makeDecision(signals, context) {
    try {
      logger.debug('Making decision', {
        token: signals.token,
        signalCount: Object.keys(signals).length
      });

      // Phase 1: Risk Filtering (Hard Stops)
      const riskCheck = this.applyRiskFilters(signals, context);
      if (!riskCheck.passed) {
        return this.createDecision('AVOID', 0, riskCheck.reason, signals.token);
      }

      // Phase 2: Score Individual Components
      const scores = this.scoreComponents(signals);

      // Phase 3: Calculate Composite Score
      const compositeScore = this.calculateCompositeScore(scores);

      // Phase 4: Apply Confidence Multiplier
      const finalScore = compositeScore * (signals.confidence || 1.0);

      // Phase 5: Determine Action
      const decision = this.determineAction(finalScore, signals, context);

      logger.info('Decision made', {
        token: signals.token,
        action: decision.action,
        finalScore: finalScore.toFixed(2),
        confidence: decision.confidence
      });

      return decision;

    } catch (error) {
      logger.error('Decision making failed:', error);
      return this.createDecision('AVOID', 0, 'ERROR: ' + error.message, signals.token);
    }
  }

  /**
   * Apply risk filters - any failure = AVOID
   */
  applyRiskFilters(signals, context) {
    const checks = [];

    // Check 1: KOL Coordination
    if (signals.kolCoordination && signals.kolCoordination >= this.riskFilters.maxKOLCoordination) {
      return {
        passed: false,
        reason: `Excessive KOL coordination detected (${signals.kolCoordination} KOLs) - likely pump & dump`
      };
    }
    checks.push('KOL_COORDINATION');

    // Check 2: Liquidity
    if (signals.liquidity && signals.liquidity < this.riskFilters.minLiquidity) {
      return {
        passed: false,
        reason: `Insufficient liquidity ($${signals.liquidity.toFixed(0)} < $${this.riskFilters.minLiquidity})`
      };
    }
    checks.push('LIQUIDITY');

    // Check 3: Volatility
    if (signals.volatility) {
      const volatilityRatio = signals.volatility / signals.price;
      if (volatilityRatio > this.riskFilters.maxVolatility) {
        return {
          passed: false,
          reason: `Excessive volatility (${(volatilityRatio * 100).toFixed(1)}% > ${(this.riskFilters.maxVolatility * 100)}%)`
        };
      }
    }
    checks.push('VOLATILITY');

    // Check 4: Portfolio Correlation
    if (context.portfolioCorrelation > this.riskFilters.maxPortfolioCorrelation) {
      return {
        passed: false,
        reason: `High correlation with existing positions (${(context.portfolioCorrelation * 100).toFixed(0)}%)`
      };
    }
    checks.push('CORRELATION');

    // Check 5: Portfolio Exposure
    if (context.currentExposure > this.riskFilters.maxPortfolioExposure) {
      return {
        passed: false,
        reason: `Portfolio exposure limit reached (${(context.currentExposure * 100).toFixed(0)}% deployed)`
      };
    }
    checks.push('EXPOSURE');

    // Check 6: Deployer Reputation
    if (signals.deployerScore !== undefined && signals.deployerScore < this.riskFilters.minDeployerScore) {
      return {
        passed: false,
        reason: `Low deployer reputation (${signals.deployerScore}/100 < ${this.riskFilters.minDeployerScore})`
      };
    }
    checks.push('DEPLOYER');

    logger.debug('Risk filters passed', { checks });

    return { passed: true, checks };
  }

  /**
   * Score each component (0-100)
   */
  scoreComponents(signals) {
    const scores = {};

    // Technical Score
    scores.technical = this.scoreTechnical(signals.technical);

    // Sentiment Score
    scores.sentiment = this.scoreSentiment(signals.sentiment);

    // Regime Score
    scores.regime = this.scoreRegime(signals.regime, signals.strategy);

    // Risk Score (inverted - lower risk = higher score)
    scores.risk = this.scoreRisk(signals.risk);

    // Timing Score
    scores.timing = this.scoreTiming(signals.timing);

    logger.debug('Component scores', scores);

    return scores;
  }

  /**
   * Score technical signals
   */
  scoreTechnical(technical) {
    if (!technical) return 50; // Neutral if no data

    let score = 50; // Start neutral

    // RSI signals
    if (technical.rsi) {
      if (technical.rsi < 30) score += 20; // Oversold = bullish
      else if (technical.rsi > 70) score -= 20; // Overbought = bearish
    }

    // MACD signals
    if (technical.macd) {
      if (technical.macd.histogram > 0) score += 10; // Bullish momentum
      else score -= 10; // Bearish momentum
    }

    // Support/Resistance
    if (technical.nearSupport) score += 15; // Near support = bullish
    if (technical.nearResistance) score -= 15; // Near resistance = bearish

    // Trend alignment
    if (technical.trend === 'UPTREND') score += 15;
    else if (technical.trend === 'DOWNTREND') score -= 15;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score sentiment signals
   */
  scoreSentiment(sentiment) {
    if (!sentiment) return 50;

    let score = 50;

    // General sentiment
    if (sentiment.overall === 'BULLISH') score += 25;
    else if (sentiment.overall === 'BEARISH') score -= 25;

    // Volume signals
    if (sentiment.volumeTrend === 'INCREASING') score += 15;
    else if (sentiment.volumeTrend === 'DECREASING') score -= 15;

    // Momentum
    if (sentiment.momentum === 'STRONG_BULLISH') score += 10;
    else if (sentiment.momentum === 'STRONG_BEARISH') score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score market regime alignment
   */
  scoreRegime(regime, strategy) {
    if (!regime || !strategy) return 50;

    let score = 50;

    // Check if strategy fits regime
    const alignment = this.checkRegimeAlignment(regime, strategy);

    if (alignment === 'PERFECT') score = 90;
    else if (alignment === 'GOOD') score = 70;
    else if (alignment === 'NEUTRAL') score = 50;
    else if (alignment === 'POOR') score = 30;
    else if (alignment === 'TERRIBLE') score = 10;

    return score;
  }

  /**
   * Check if strategy aligns with market regime
   */
  checkRegimeAlignment(regime, strategy) {
    const alignments = {
      'TRENDING': {
        'TREND_CONTINUATION': 'PERFECT',
        'MOMENTUM': 'PERFECT',
        'BREAKOUT': 'GOOD',
        'MEAN_REVERSION': 'POOR',
        'RANGE_SCALP': 'TERRIBLE'
      },
      'RANGING': {
        'MEAN_REVERSION': 'PERFECT',
        'RANGE_SCALP': 'PERFECT',
        'SUPPORT_BOUNCE': 'GOOD',
        'TREND_CONTINUATION': 'POOR',
        'BREAKOUT': 'NEUTRAL'
      },
      'VOLATILE': {
        'BREAKOUT': 'GOOD',
        'MOMENTUM': 'NEUTRAL',
        'MEAN_REVERSION': 'POOR',
        'RANGE_SCALP': 'TERRIBLE'
      },
      'CONSOLIDATION': {
        'RANGE_SCALP': 'PERFECT',
        'MEAN_REVERSION': 'GOOD',
        'BREAKOUT': 'GOOD',
        'TREND_CONTINUATION': 'POOR'
      }
    };

    return alignments[regime]?.[strategy] || 'NEUTRAL';
  }

  /**
   * Score risk (inverted - lower risk = higher score)
   */
  scoreRisk(risk) {
    if (!risk) return 50;

    let score = 100; // Start with max score

    // KOL coordination reduces score
    if (risk.kolCoordination) {
      score -= (risk.kolCoordination * 10); // -10 per KOL
    }

    // Flash crash risk
    if (risk.flashCrashRisk === 'HIGH') score -= 30;
    else if (risk.flashCrashRisk === 'MODERATE') score -= 15;

    // MEV risk
    if (risk.mevRisk === 'HIGH') score -= 20;
    else if (risk.mevRisk === 'MODERATE') score -= 10;

    // Manipulation risk
    if (risk.manipulationDetected) score -= 40;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Score timing (is now a good time to enter?)
   */
  scoreTiming(timing) {
    if (!timing) return 50;

    let score = 50;

    // Spread
    if (timing.spread < 0.003) score += 20; // <0.3% spread = good
    else if (timing.spread > 0.01) score -= 20; // >1% spread = bad

    // Liquidity depth at entry price
    if (timing.liquidityDepth > 1000000) score += 15; // >$1M = good
    else if (timing.liquidityDepth < 100000) score -= 15; // <$100k = bad

    // Time of day (avoid low liquidity hours)
    const hour = new Date().getUTCHours();
    if (hour >= 14 && hour <= 20) score += 10; // Peak hours (US market)
    else if (hour >= 0 && hour <= 6) score -= 10; // Low liquidity (Asian hours)

    // Recent volatility
    if (timing.recentVolatility === 'STABLE') score += 10;
    else if (timing.recentVolatility === 'VOLATILE') score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate weighted composite score
   */
  calculateCompositeScore(scores) {
    const composite = (
      scores.technical * this.weights.technical +
      scores.sentiment * this.weights.sentiment +
      scores.regime * this.weights.regime +
      scores.risk * this.weights.risk +
      scores.timing * this.weights.timing
    );

    return composite;
  }

  /**
   * Determine final action based on score
   */
  determineAction(score, signals, context) {
    let action, urgency, positionSizeMultiplier;

    if (score >= this.thresholds.strongBuy) {
      action = 'EXECUTE';
      urgency = 'IMMEDIATE';
      positionSizeMultiplier = 1.0;
    } else if (score >= this.thresholds.buy) {
      action = 'EXECUTE';
      urgency = 'NORMAL';
      positionSizeMultiplier = (score - this.thresholds.buy) / (this.thresholds.strongBuy - this.thresholds.buy);
    } else if (score >= this.thresholds.neutral) {
      action = 'WAIT';
      urgency = 'PATIENT';
      positionSizeMultiplier = 0.5;
    } else {
      action = 'AVOID';
      urgency = 'NONE';
      positionSizeMultiplier = 0;
    }

    return this.createDecision(
      action,
      score,
      this.generateReasoning(score, signals),
      signals.token,
      urgency,
      positionSizeMultiplier,
      signals
    );
  }

  /**
   * Create decision object
   */
  createDecision(action, confidence, reasoning, token, urgency = 'NONE', positionSizeMultiplier = 0, signals = {}) {
    return {
      token: token,
      action: action,           // EXECUTE, WAIT, AVOID
      confidence: confidence,   // 0-100
      reasoning: reasoning,
      urgency: urgency,         // IMMEDIATE, NORMAL, PATIENT, NONE
      positionSizeMultiplier: positionSizeMultiplier,
      timestamp: Date.now(),

      // Execution parameters (if action = EXECUTE)
      execution: action === 'EXECUTE' ? {
        direction: signals.direction || 'LONG',
        entry: signals.entry,
        stopLoss: signals.stopLoss,
        takeProfit: signals.takeProfit,
        timeframe: signals.timeframe,
        strategy: signals.strategy
      } : null,

      // Risk parameters
      risk: {
        maxLoss: signals.maxLoss || 0.02, // 2% max loss
        riskReward: signals.riskReward || 2.0
      }
    };
  }

  /**
   * Generate human-readable reasoning
   */
  generateReasoning(score, signals) {
    const reasons = [];

    if (score >= 75) {
      reasons.push('Strong confluence of positive signals');
    } else if (score >= 60) {
      reasons.push('Favorable setup with acceptable risk');
    } else if (score >= 40) {
      reasons.push('Mixed signals, monitoring recommended');
    } else {
      reasons.push('Insufficient conviction or high risk');
    }

    // Add specific signal details
    if (signals.technical?.rsi < 30) {
      reasons.push('RSI oversold');
    }
    if (signals.technical?.nearSupport) {
      reasons.push('Price near support');
    }
    if (signals.regime === 'TRENDING' && signals.strategy === 'TREND_CONTINUATION') {
      reasons.push('Strategy aligned with market regime');
    }
    if (signals.kolCoordination >= 3) {
      reasons.push('WARNING: Coordinated KOL activity detected');
    }

    return reasons.join('. ');
  }

  /**
   * Batch decision making for multiple tokens
   */
  async evaluateMultiple(tokensSignals, context) {
    const decisions = [];

    for (const signals of tokensSignals) {
      const decision = await this.makeDecision(signals, context);
      decisions.push(decision);
    }

    // Sort by confidence (highest first)
    decisions.sort((a, b) => b.confidence - a.confidence);

    logger.info('Batch evaluation complete', {
      total: decisions.length,
      execute: decisions.filter(d => d.action === 'EXECUTE').length,
      wait: decisions.filter(d => d.action === 'WAIT').length,
      avoid: decisions.filter(d => d.action === 'AVOID').length
    });

    return decisions;
  }

  /**
   * Update decision weights based on performance feedback
   */
  updateWeights(performanceData) {
    // Machine learning component - adjust weights based on what's working
    // This would use historical performance to optimize the decision-making

    // Placeholder for future ML implementation
    logger.info('Weight update requested (ML not yet implemented)');
  }
}

module.exports = DecisionEngine;
