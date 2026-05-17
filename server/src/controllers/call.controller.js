const Call = require('../models/call.model');
const Room = require('../models/room.model');

/**
 * جلب سجل المكالمات لمستخدم محدد
 */
exports.getUserCalls = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // البحث عن المكالمات التي شارك فيها المستخدم
    const calls = await Call.find({
      $or: [
        { caller: userId },
        { 'participants.user': userId }
      ]
    })
    .populate('room', 'name image isGroup')
    .populate('caller', 'name email images')
    .populate('participants.user', 'name email images')
    .populate('endedBy', 'name email images')
    .sort({ startedAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Call.countDocuments({
      $or: [
        { caller: userId },
        { 'participants.user': userId }
      ]
    });

    res.json({
      success: true,
      calls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching user calls:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calls',
      error: error.message
    });
  }
};

/**
 * جلب سجل المكالمات لغرفة محددة
 */
exports.getRoomCalls = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    // التحقق من أن المستخدم عضو في الغرفة
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }

    const isMember = room.members.some(
      member => member.toString() === userId.toString()
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this room'
      });
    }

    const calls = await Call.find({ room: roomId })
      .populate('caller', 'name email images')
      .populate('participants.user', 'name email images')
      .populate('endedBy', 'name email images')
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Call.countDocuments({ room: roomId });

    res.json({
      success: true,
      calls,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching room calls:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch room calls',
      error: error.message
    });
  }
};

/**
 * جلب تفاصيل مكالمة محددة
 */
exports.getCallDetails = async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;

    const call = await Call.findById(callId)
      .populate('room', 'name image isGroup')
      .populate('caller', 'name email images')
      .populate('participants.user', 'name email images')
      .populate('endedBy', 'name email images');

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // التحقق من أن المستخدم مشارك في المكالمة
    const isParticipant = 
      call.caller.toString() === userId.toString() ||
      call.participants.some(p => p.user.toString() === userId.toString());

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant of this call'
      });
    }

    res.json({
      success: true,
      call
    });
  } catch (error) {
    console.error('Error fetching call details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call details',
      error: error.message
    });
  }
};

