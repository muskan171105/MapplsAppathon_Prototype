const Event = require('../models/Event');
const Geofence = require('../models/Geofence');
const { ErrorResponse, asyncHandler } = require('../middleware/errorMiddleware');

/**
 * @desc    Get all events
 * @route   GET /api/events
 * @access  Public
 */
const getEvents = asyncHandler(async (req, res) => {
  res.status(200).json(res.advancedResults);
});

/**
 * @desc    Get single event
 * @route   GET /api/events/:id
 * @access  Public
 */
const getEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).populate({
    path: 'organizer',
    select: 'name email'
  });

  if (!event) {
    throw new ErrorResponse(`Event not found with id of ${req.params.id}`, 404);
  }

  res.status(200).json({
    success: true,
    data: event
  });
});

/**
 * @desc    Create new event
 * @route   POST /api/events
 * @access  Private
 */
const createEvent = asyncHandler(async (req, res) => {
  // Add user to req.body
  req.body.organizer = req.user.id;

  // Check if user is an NGO or admin
  if (req.user.role !== 'ngo' && req.user.role !== 'admin') {
    throw new ErrorResponse(
      `User with role ${req.user.role} is not authorized to create an event`,
      403
    );
  }

  const event = await Event.create(req.body);

  // Create geofence for the event
  await Geofence.create({
    event: event._id,
    radius: req.body.geofenceRadius || 500,
    center: {
      latitude: event.coordinates.latitude,
      longitude: event.coordinates.longitude
    },
    trafficImpact: {
      level: req.body.trafficImpact || 'low',
      description: `Traffic impact for ${event.title}`
    },
    createdBy: req.user.id
  });

  res.status(201).json({
    success: true,
    data: event
  });
});

/**
 * @desc    Update event
 * @route   PUT /api/events/:id
 * @access  Private
 */
const updateEvent = asyncHandler(async (req, res) => {
  let event = await Event.findById(req.params.id);

  if (!event) {
    throw new ErrorResponse(`Event not found with id of ${req.params.id}`, 404);
  }

  // Make sure user is event organizer or admin
  if (
    event.organizer.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    throw new ErrorResponse(
      `User ${req.user.id} is not authorized to update this event`,
      403
    );
  }

  event = await Event.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  // Update geofence if coordinates changed
  if (req.body.coordinates) {
    await Geofence.findOneAndUpdate(
      { event: event._id },
      {
        center: {
          latitude: req.body.coordinates.latitude,
          longitude: req.body.coordinates.longitude
        },
        radius: req.body.geofenceRadius || 500,
        trafficImpact: {
          level: req.body.trafficImpact || 'low'
        }
      },
      {
        new: true,
        runValidators: true
      }
    );
  }

  res.status(200).json({
    success: true,
    data: event
  });
});

/**
 * @desc    Delete event
 * @route   DELETE /api/events/:id
 * @access  Private
 */
const deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new ErrorResponse(`Event not found with id of ${req.params.id}`, 404);
  }

  // Make sure user is event organizer or admin
  if (
    event.organizer.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    throw new ErrorResponse(
      `User ${req.user.id} is not authorized to delete this event`,
      403
    );
  }

  // Delete associated geofence
  await Geofence.findOneAndDelete({ event: event._id });

  // Delete the event
  await event.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Get events within radius
 * @route   GET /api/events/radius/:zipcode/:distance
 * @access  Public
 */
const getEventsInRadius = asyncHandler(async (req, res) => {
  const { latitude, longitude, distance } = req.params;

  // Calculate radius using radians
  // Divide distance by radius of Earth
  // Earth Radius = 6,378 km or 3,963 miles
  const radius = distance / 6378;

  const events = await Event.find({
    coordinates: {
      $geoWithin: { $centerSphere: [[longitude, latitude], radius] }
    }
  });

  res.status(200).json({
    success: true,
    count: events.length,
    data: events
  });
});

/**
 * @desc    Get upcoming events
 * @route   GET /api/events/upcoming
 * @access  Public
 */
const getUpcomingEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({
    date: { $gte: new Date() },
    status: 'upcoming'
  })
    .sort({ date: 1 })
    .limit(10)
    .populate({
      path: 'organizer',
      select: 'name'
    });

  res.status(200).json({
    success: true,
    count: events.length,
    data: events
  });
});

/**
 * @desc    Get events by category
 * @route   GET /api/events/category/:category
 * @access  Public
 */
const getEventsByCategory = asyncHandler(async (req, res) => {
  const events = await Event.find({
    category: req.params.category,
    date: { $gte: new Date() }
  })
    .sort({ date: 1 })
    .populate({
      path: 'organizer',
      select: 'name'
    });

  res.status(200).json({
    success: true,
    count: events.length,
    data: events
  });
});

/**
 * @desc    Get events organized by user
 * @route   GET /api/events/user/:userId
 * @access  Public
 */
const getUserEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({
    organizer: req.params.userId
  }).sort({ date: -1 });

  res.status(200).json({
    success: true,
    count: events.length,
    data: events
  });
});

module.exports = {
  getEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  getEventsInRadius,
  getUpcomingEvents,
  getEventsByCategory,
  getUserEvents
};
