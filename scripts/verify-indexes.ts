/**
 * MongoDB Index Verification Script
 * 
 * Run with: npx ts-node scripts/verify-indexes.ts
 * 
 * This script:
 * 1. Lists all indexes on chat-related collections
 * 2. Runs explain() on common queries to verify index usage
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in environment');
  process.exit(1);
}

async function verifyIndexes() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    // List indexes on collections
    console.log('=== CONVERSATION INDEXES ===');
    const convIndexes = await db.collection('conversations').indexes();
    convIndexes.forEach((idx) => {
      console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    console.log('\n=== MESSAGE INDEXES ===');
    const msgIndexes = await db.collection('messages').indexes();
    msgIndexes.forEach((idx) => {
      console.log(`  ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Test query plans
    console.log('\n=== QUERY PLAN ANALYSIS ===\n');

    // Query 1: Find conversations by participant
    console.log('1. Find conversations by participant:');
    const q1 = await db.collection('conversations').find({
      'participants.user': new mongoose.Types.ObjectId(),
      'participants.isActive': true,
    }).explain('executionStats');
    console.log(`   Index used: ${q1.queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN'}`);
    console.log(`   Stage: ${q1.queryPlanner?.winningPlan?.inputStage?.stage || q1.queryPlanner?.winningPlan?.stage}`);

    // Query 2: Find messages by conversation with sort
    console.log('\n2. Find messages by conversation (sorted):');
    const q2 = await db.collection('messages').find({
      conversation: new mongoose.Types.ObjectId(),
      isDeleted: false,
    }).sort({ createdAt: -1 }).explain('executionStats');
    console.log(`   Index used: ${q2.queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN'}`);
    console.log(`   Stage: ${q2.queryPlanner?.winningPlan?.inputStage?.stage || q2.queryPlanner?.winningPlan?.stage}`);

    // Query 3: Find direct conversation between users
    console.log('\n3. Find direct conversation between users:');
    const q3 = await db.collection('conversations').find({
      type: 'direct',
      'participants.user': { $all: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()] },
    }).explain('executionStats');
    console.log(`   Index used: ${q3.queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN'}`);
    console.log(`   Stage: ${q3.queryPlanner?.winningPlan?.inputStage?.stage || q3.queryPlanner?.winningPlan?.stage}`);

    // Query 4: Find messages by sender
    console.log('\n4. Find messages by sender:');
    const q4 = await db.collection('messages').find({
      sender: new mongoose.Types.ObjectId(),
    }).explain('executionStats');
    console.log(`   Index used: ${q4.queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN'}`);
    console.log(`   Stage: ${q4.queryPlanner?.winningPlan?.inputStage?.stage || q4.queryPlanner?.winningPlan?.stage}`);

    // Query 5: Find channel by name
    console.log('\n5. Find channel by name:');
    const q5 = await db.collection('conversations').find({
      type: 'group',
      name: 'general',
    }).explain('executionStats');
    console.log(`   Index used: ${q5.queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN'}`);
    console.log(`   Stage: ${q5.queryPlanner?.winningPlan?.inputStage?.stage || q5.queryPlanner?.winningPlan?.stage}`);

    console.log('\n=== INDEX VERIFICATION COMPLETE ===');
    console.log('\nExpected stages:');
    console.log('  IXSCAN = Index Scan (good)');
    console.log('  COLLSCAN = Collection Scan (needs index)');
    console.log('  FETCH = Document fetch after index lookup (normal)');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

verifyIndexes();
