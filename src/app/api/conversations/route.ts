import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { connectDB, Conversation, User } from '@/lib/db';
import mongoose from 'mongoose';
import {
  checkApiRateLimit,
  secureResponse,
  errorResponse,
  RATE_LIMITS,
  isValidObjectId,
  sanitizeName,
  validateString,
} from '@/lib/security';

// POST /api/conversations - Create or get a conversation
export async function POST(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimit = checkApiRateLimit(request, 'conversations', RATE_LIMITS.API_GENERAL);
    if (!rateLimit.allowed) return rateLimit.response!;

    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('Unauthorized', 401);
    }

    await connectDB();

    const body = await request.json();
    const { type, name, participantIds } = body;

    // For channel type, find or create by name
    if (type === 'channel') {
      // Validate and sanitize name
      const nameValidation = validateString(name, { minLength: 1, maxLength: 100 });
      if (!nameValidation.valid) {
        return errorResponse(nameValidation.error || 'Invalid channel name');
      }
      const sanitizedName = sanitizeName(name);

      let conversation = await Conversation.findOne({
        type: 'group',
        name: sanitizedName,
      });

      if (!conversation) {
        // Get or create the user in DB
        let dbUser = await User.findOne({ email: session.user.email });
        if (!dbUser) {
          dbUser = await User.create({
            email: session.user.email!,
            name: session.user.name || 'User',
            image: session.user.image || undefined,
            provider: 'credentials',
            status: 'online',
          });
        }

        conversation = await Conversation.create({
          type: 'group',
          name: sanitizedName,
          participants: [
            {
              user: dbUser._id,
              role: 'admin',
              isActive: true,
            },
          ],
          createdBy: dbUser._id,
        });
      } else {
        // Add user to conversation if not already a participant
        let dbUser = await User.findOne({ email: session.user.email });
        if (!dbUser) {
          dbUser = await User.create({
            email: session.user.email!,
            name: session.user.name || 'User',
            image: session.user.image || undefined,
            provider: 'credentials',
            status: 'online',
          });
        }

        const isParticipant = conversation.participants.some(
          (p: any) => p.user.toString() === dbUser._id.toString()
        );

        if (!isParticipant) {
          conversation.participants.push({
            user: dbUser._id,
            role: 'member',
            isActive: true,
            joinedAt: new Date(),
          });
          await conversation.save();
        }
      }

      return secureResponse(conversation);
    }

    // For direct messages
    if (type === 'direct' && participantIds?.length === 1) {
      const otherUserId = participantIds[0];
      
      // Validate participant ID
      if (!isValidObjectId(otherUserId)) {
        return errorResponse('Invalid participant ID');
      }
      
      let dbUser = await User.findOne({ email: session.user.email });
      if (!dbUser) {
        dbUser = await User.create({
          email: session.user.email!,
          name: session.user.name || 'User',
          image: session.user.image || undefined,
          provider: 'credentials',
          status: 'online',
        });
      }

      // Find existing direct conversation
      let conversation = await Conversation.findOne({
        type: 'direct',
        'participants.user': { $all: [dbUser._id, new mongoose.Types.ObjectId(otherUserId)] },
        $expr: { $eq: [{ $size: '$participants' }, 2] },
      });

      if (!conversation) {
        conversation = await Conversation.create({
          type: 'direct',
          participants: [
            { user: dbUser._id, role: 'member', isActive: true },
            { user: new mongoose.Types.ObjectId(otherUserId), role: 'member', isActive: true },
          ],
          createdBy: dbUser._id,
        });
      }

      return secureResponse(conversation);
    }

    return errorResponse('Invalid request');
  } catch (error) {
    console.error('Error creating conversation:', error);
    return errorResponse('Failed to create conversation', 500);
  }
}

// GET /api/conversations - Get user's conversations
export async function GET(request: NextRequest) {
  try {
    // Rate limit check
    const rateLimit = checkApiRateLimit(request, 'conversations', RATE_LIMITS.API_GENERAL);
    if (!rateLimit.allowed) return rateLimit.response!;

    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse('Unauthorized', 401);
    }

    await connectDB();

    let dbUser = await User.findOne({ email: session.user.email }).lean();
    if (!dbUser) {
      return secureResponse([]);
    }

    // Filter out old default channel conversations
    const excludedChannelNames = ['general', 'random', 'announcements', 'help'];

    const conversations = await Conversation.find({
      'participants.user': dbUser._id,
      'participants.isActive': true,
      // Exclude old channel-type conversations
      $or: [
        { type: 'direct' },
        { type: 'group', name: { $nin: excludedChannelNames } },
      ],
    })
      .populate('participants.user', 'name email image status')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 })
      .lean();

    return secureResponse(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return errorResponse('Failed to fetch conversations', 500);
  }
}
