#!/usr/bin/env node

const MadeOnSolClient = require('../src/services/madeOnSolClient');
const KOLMonitor = require('../src/services/kolMonitor');
const logger = require('../src/utils/logger');
require('dotenv').config();

/**
 * Test API Connections
 *
 * Verifies that all external API integrations are working correctly
 */

async function testMadeOnSol() {
  console.log('\n🧪 Testing MadeOnSol API Connection...\n');

  const client = new MadeOnSolClient();

  if (!client.enabled) {
    console.log('❌ MadeOnSol API not configured');
    console.log('   Set MADEONSOL_API_KEY in your .env file\n');
    return false;
  }

  try {
    // Test 1: Get top KOLs
    console.log('Test 1: Fetching top 5 KOLs...');
    const kols = await client.getTopKOLs(5);

    if (kols.length > 0) {
      console.log(`✓ Success! Found ${kols.length} KOLs`);
      console.log(`   Sample: ${kols[0].name || kols[0].address}\n`);
    } else {
      console.log('⚠️  No KOLs returned (may be empty list)\n');
    }

    // Test 2: Get trending tokens
    console.log('Test 2: Fetching trending Pump.fun tokens...');
    const tokens = await client.getTrendingPumpTokens(5);

    if (tokens.length > 0) {
      console.log(`✓ Success! Found ${tokens.length} trending tokens`);
      console.log(`   Sample: ${tokens[0].symbol} (${tokens[0].riskLevel} risk)\n`);
    } else {
      console.log('⚠️  No trending tokens returned\n');
    }

    // Test 3: Get market intelligence
    console.log('Test 3: Compiling market intelligence...');
    const intelligence = await client.getMarketIntelligence();

    if (intelligence) {
      console.log('✓ Success! Market intelligence compiled');
      console.log(`   Active KOLs: ${intelligence.marketActivity.activeKOLs}`);
      console.log(`   Alerts: ${intelligence.alerts.length}\n`);
    }

    console.log('✅ MadeOnSol API: ALL TESTS PASSED\n');
    return true;

  } catch (error) {
    console.log(`❌ MadeOnSol API Error: ${error.message}\n`);
    if (error.message.includes('Invalid')) {
      console.log('   Your API key may be invalid. Check your .env file.\n');
    }
    return false;
  }
}

async function testKOLMonitor() {
  console.log('\n🧪 Testing KOL Monitor...\n');

  const monitor = new KOLMonitor({
    enableKOLTracking: true,
    kolAlertThreshold: 3,
    coordinationWindow: 300000
  });

  if (!monitor.enabled || !monitor.madeOnSol.enabled) {
    console.log('❌ KOL Monitor not fully configured\n');
    return false;
  }

  try {
    console.log('Loading KOL watchlist...');
    await monitor.loadKOLWatchlist();

    console.log(`✓ Loaded ${monitor.monitoredKOLs.length} KOLs to watch`);

    const status = monitor.getStatus();
    console.log(`✓ Monitor Status:`);
    console.log(`   Monitored KOLs: ${status.monitoredKOLs}`);
    console.log(`   Alert Threshold: ${status.configuration.alertThreshold}+ KOLs`);
    console.log(`   Coordination Window: ${status.configuration.coordinationWindow / 1000}s\n`);

    console.log('✅ KOL Monitor: ALL TESTS PASSED\n');
    return true;

  } catch (error) {
    console.log(`❌ KOL Monitor Error: ${error.message}\n`);
    return false;
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║           API CONNECTION TEST SUITE                           ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const results = {
    madeOnSol: false,
    kolMonitor: false
  };

  // Test MadeOnSol API
  results.madeOnSol = await testMadeOnSol();

  // Test KOL Monitor
  results.kolMonitor = await testKOLMonitor();

  // Summary
  console.log('\n' + '═'.repeat(66));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(66));
  console.log(`MadeOnSol API:    ${results.madeOnSol ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`KOL Monitor:      ${results.kolMonitor ? '✅ PASS' : '❌ FAIL'}`);
  console.log('═'.repeat(66) + '\n');

  if (results.madeOnSol && results.kolMonitor) {
    console.log('🎉 All systems operational! Ready to trade.\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some systems failed. Check your configuration.\n');
    console.log('💡 Make sure you have:');
    console.log('   1. Created a .env file (copy from .env.example)');
    console.log('   2. Added your MADEONSOL_API_KEY to .env');
    console.log('   3. Set ENABLE_KOL_TRACKING=true if you want monitoring\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
