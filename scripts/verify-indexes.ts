/**
 * Database Index Verification & Optimization Script
 * 
 * Verifies indexes exist, analyzes query performance, and suggests optimizations.
 * Run with: npx tsx scripts/verify-indexes.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

interface IndexInfo {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
  background?: boolean;
}

interface IndexStats {
  name: string;
  accesses: { ops: number; since: Date };
}

// Recommended indexes for optimal chat app performance
const RECOMMENDED_INDEXES = {
  messages: [
    { key: { conversation: 1, createdAt: -1 }, name: 'conversation_messages_timeline' },
    { key: { conversation: 1, isDeleted: 1, createdAt: -1, _id: -1 }, name: 'conversation_messages_cursor_pagination' },
    { key: { conversation: 1, 'statusPerUser.user': 1, 'statusPerUser.status': 1 }, name: 'unread_messages_lookup' },
    { key: { sender: 1, createdAt: -1 }, name: 'user_messages_history' },
    { key: { _id: 1, conversation: 1, sender: 1 }, name: 'batch_status_update' },
  ],
  conversations: [
    { key: { 'participants.user': 1, 'participants.isActive': 1 }, name: 'active_participants' },
    { key: { type: 1, 'participants.user': 1 }, name: 'direct_conversation_lookup' },
    { key: { lastMessageAt: -1 }, name: 'recent_conversations' },
    { key: { type: 1, name: 1 }, name: 'channel_name_lookup' },
  ],
  users: [
    { key: { email: 1 }, name: 'email_unique', unique: true },
    { key: { provider: 1, providerId: 1 }, name: 'oauth_lookup' },
    { key: { status: 1, lastSeen: -1 }, name: 'online_users' },
  ],
  groups: [
    { key: { 'members.user': 1 }, name: 'group_members' },
    { key: { owner: 1 }, name: 'group_owner' },
    { key: { conversation: 1 }, name: 'group_conversation' },
    { key: { 'metadata.isPublic': 1, 'metadata.name': 1 }, name: 'public_groups' },
  ],
};

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment');
  process.exit(1);
}

async function verifyIndexes() {
  console.log('🔍 Database Index Verification & Optimization\n');
  console.log('═'.repeat(60));

  await mongoose.connect(MONGODB_URI!);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;
  if (!db) {
    console.error('❌ Database connection not established');
    process.exit(1);
  }

  const results: { collection: string; status: string; missing: string[]; unused: string[] }[] = [];

  for (const [collectionName, recommendedIndexes] of Object.entries(RECOMMENDED_INDEXES)) {
    console.log(`\n📊 Collection: ${collectionName.toUpperCase()}`);
    console.log('─'.repeat(60));

    try {
      const collection = db.collection(collectionName);
      const existingIndexes = await collection.indexes() as IndexInfo[];
      
      // Get index usage stats
      let indexStats: IndexStats[] = [];
      try {
        const statsResult = await collection.aggregate([{ $indexStats: {} }]).toArray();
        indexStats = statsResult as IndexStats[];
      } catch {
        // $indexStats may not be available
      }

      console.log(`\n   Existing Indexes (${existingIndexes.length}):`);
      
      const existingKeyStrings = new Set<string>();
      existingIndexes.forEach((index) => {
        const keyStr = JSON.stringify(index.key);
        existingKeyStrings.add(keyStr);
        
        const keyDisplay = Object.entries(index.key)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ');
        
        // Find usage stats
        const stats = indexStats.find(s => s.name === index.name);
        const usageStr = stats ? ` [${stats.accesses.ops} ops]` : '';
        
        const flags = [];
        if (index.unique) flags.push('unique');
        if (index.sparse) flags.push('sparse');
        const flagStr = flags.length ? ` (${flags.join(', ')})` : '';
        
        const icon = index.name === '_id_' ? '🔑' : '✓';
        console.log(`   ${icon} ${index.name}${flagStr}${usageStr}`);
        console.log(`      {${keyDisplay}}`);
      });

      // Check for missing recommended indexes
      const missing: string[] = [];
      console.log(`\n   Recommended Index Check:`);
      
      recommendedIndexes.forEach((rec) => {
        const keyStr = JSON.stringify(rec.key);
        const exists = existingKeyStrings.has(keyStr) || 
          existingIndexes.some(e => e.name === rec.name);
        
        if (exists) {
          console.log(`   ✅ ${rec.name}`);
        } else {
          console.log(`   ❌ ${rec.name} - MISSING`);
          missing.push(rec.name);
        }
      });

      // Check for potentially unused indexes
      const unused: string[] = [];
      if (indexStats.length > 0) {
        indexStats.forEach((stat) => {
          if (stat.name !== '_id_' && stat.accesses.ops === 0) {
            unused.push(stat.name);
          }
        });
        
        if (unused.length > 0) {
          console.log(`\n   ⚠️ Potentially Unused Indexes:`);
          unused.forEach(name => console.log(`      - ${name}`));
        }
      }

      results.push({ collection: collectionName, status: missing.length === 0 ? 'OK' : 'NEEDS_ATTENTION', missing, unused });

    } catch (error) {
      console.log(`   ⚠️ Collection may not exist yet`);
      results.push({ collection: collectionName, status: 'NOT_FOUND', missing: [], unused: [] });
    }
  }

  // Query Plan Analysis
  console.log('\n' + '═'.repeat(60));
  console.log('📈 QUERY PLAN ANALYSIS');
  console.log('═'.repeat(60));

  try {
    // Query 1: Find conversations by participant
    console.log('\n1. Find conversations by participant:');
    const q1 = await db.collection('conversations').find({
      'participants.user': new mongoose.Types.ObjectId(),
      'participants.isActive': true,
    }).explain('executionStats');
    const stage1 = q1.queryPlanner?.winningPlan?.inputStage?.stage || q1.queryPlanner?.winningPlan?.stage;
    const index1 = q1.queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN';
    console.log(`   Stage: ${stage1} | Index: ${index1}`);

    // Query 2: Find messages by conversation with sort
    console.log('\n2. Find messages by conversation (sorted):');
    const q2 = await db.collection('messages').find({
      conversation: new mongoose.Types.ObjectId(),
      isDeleted: false,
    }).sort({ createdAt: -1 }).explain('executionStats');
    const stage2 = q2.queryPlanner?.winningPlan?.inputStage?.stage || q2.queryPlanner?.winningPlan?.stage;
    const index2 = q2.queryPlanner?.winningPlan?.inputStage?.indexName || 'COLLSCAN';
    console.log(`   Stage: ${stage2} | Index: ${index2}`);

  } catch (error) {
    console.log('   (Query analysis not available)');
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📋 SUMMARY');
  console.log('═'.repeat(60));
  
  results.forEach(r => {
    const icon = r.status === 'OK' ? '✅' : r.status === 'NOT_FOUND' ? '⚠️' : '❌';
    console.log(`${icon} ${r.collection}: ${r.status}`);
    if (r.missing.length > 0) {
      console.log(`   Missing: ${r.missing.join(', ')}`);
    }
  });

  // Generate create index commands for missing indexes
  const allMissing = results.flatMap(r => 
    r.missing.map(name => {
      const rec = RECOMMENDED_INDEXES[r.collection as keyof typeof RECOMMENDED_INDEXES]
        ?.find(i => i.name === name);
      return rec ? { collection: r.collection, ...rec } : null;
    }).filter(Boolean)
  );

  if (allMissing.length > 0) {
    console.log('\n' + '═'.repeat(60));
    console.log('🔧 CREATE MISSING INDEXES');
    console.log('═'.repeat(60));
    console.log('\nRun these commands in MongoDB shell:\n');
    
    allMissing.forEach((idx: any) => {
      const options = idx.unique ? ', { unique: true }' : '';
      console.log(`db.${idx.collection}.createIndex(${JSON.stringify(idx.key)}, { name: "${idx.name}", background: true }${options})`);
    });
  }

  await mongoose.disconnect();
  console.log('\n✅ Verification complete\n');
}

verifyIndexes().catch(console.error);
