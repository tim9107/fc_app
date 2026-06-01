import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = "mongodb+srv://tlangenauer_db_user:Test123467@cluster0.u4yfkok.mongodb.net/Projekt?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB verbunden'))
  .catch(err => console.error('❌ MongoDB Verbindungsfehler:', err));

// --- Schemas ---
const TeamSchema = new mongoose.Schema({
  id: Number,
  name: String
});
const Team = mongoose.model('TrainingTeam', TeamSchema, 'training_teams');

const UserSchema = new mongoose.Schema({
  id: Number,
  name: String,
  role: String,
  teamId: { type: Number, default: 1 },
  goals: { type: Number, default: 0 },
  motmCount: { type: Number, default: 0 }
});
const User = mongoose.model('TrainingUser', UserSchema, 'training_users');

const EventSchema = new mongoose.Schema({
  id: Number,
  teamId: { type: Number, default: 1 },
  date: String,
  time: String,
  meetingTime: String,
  location: String,
  type: String,
  title: String,
  coach: String,
  isCanceled: { type: Boolean, default: false },
  motm: { type: String, default: "" },
  participants: { yes: { type: Number, default: 0 }, no: { type: Number, default: 0 } },
  playerDetails: [{ name: String, status: String, reason: String }],
  result: {
    isPlayed: { type: Boolean, default: false },
    home: { type: Number, default: null },
    away: { type: Number, default: null }
  },
  matchEvents: { type: Array, default: [] },
  lineup: {
    isPublished: { type: Boolean, default: false },
    bench: [String],
    captain: { type: String, default: "" },
    pitchPlayers: [{ name: String, x: Number, y: Number }]
  }
});
const Event = mongoose.model('TrainingEvent', EventSchema, 'training_events');

const MessageSchema = new mongoose.Schema({
  id: Number,
  teamId: { type: Number, default: 1 },
  text: String,
  date: String,
  author: String,
  reactions: { type: mongoose.Schema.Types.Mixed, default: {} }
});
const Message = mongoose.model('TrainingMessage', MessageSchema, 'training_messages');

const NotificationSchema = new mongoose.Schema({
  id: Number,
  teamId: { type: Number, default: 1 },
  text: String,
  date: String,
  icon: String
});
const Notification = mongoose.model('TrainingNotification', NotificationSchema, 'training_notifications');

// --- Initialization ---
async function initDB() {
  try {
    const userCount = await User.countDocuments();
    const teamCount = await Team.countDocuments();

    if (teamCount === 0) {
      await Team.insertMany([{ id: 1, name: "1. Mannschaft" }]);
    }

    if (userCount === 0) {
      console.log("Initialisiere Beispieldaten in MongoDB...");
      const d = new Date();
      const getOffsetDateStr = (offset) => {
        const nd = new Date(d);
        nd.setDate(nd.getDate() + offset);
        return nd.toISOString().split('T')[0];
      };

      await User.insertMany([
        { id: 1, name: 'Tim', role: 'player', teamId: 1, goals: 0, motmCount: 0 },
        { id: 2, name: 'Lars Müller', role: 'player', teamId: 1, goals: 2, motmCount: 1 },
        { id: 3, name: 'Jan Schmid', role: 'player', teamId: 1, goals: 5, motmCount: 0 },
        { id: 4, name: 'Raffi', role: 'coach', teamId: 1, goals: 0, motmCount: 0 },
        { id: 5, name: 'Admin', role: 'admin', teamId: 1, goals: 0, motmCount: 0 }
      ]);

      await Event.insertMany([
        {
          id: 1, teamId: 1, date: getOffsetDateStr(0), time: "19:30 - 21:00", meetingTime: "19:15", location: "Sporthalle Mitte",
          type: "Training", title: "Taktik & Ausdauer", coach: "Raffi",
          isCanceled: false, motm: "",
          participants: { yes: 1, no: 1 },
          playerDetails: [
            { name: "Lars Müller", status: "no", reason: "Verletzt" },
            { name: "Jan Schmid", status: "yes", reason: "" }
          ],
          lineup: { isPublished: false, bench: [], captain: "", pitchPlayers: [] }
        },
        {
          id: 2, teamId: 1, date: getOffsetDateStr(3), time: "15:00 - 17:00", meetingTime: "14:00", location: "Stadion Süd",
          type: "Spiel", title: "Heimspiel vs. FC Basel", coach: "Raffi",
          isCanceled: false, motm: "",
          participants: { yes: 0, no: 0 }, playerDetails: [],
          lineup: { isPublished: false, bench: [], captain: "", pitchPlayers: [] }
        }
      ]);

      await Message.insertMany([
        { id: 1, teamId: 1, text: "Willkommen in der neuen Training-App!", date: new Date().toISOString(), author: "Raffi", reactions: {} }
      ]);

      await Notification.insertMany([
        { id: 1, teamId: 1, text: "Willkommen in der neuen App!", date: new Date().toISOString(), icon: "🎉" }
      ]);

      console.log("Beispieldaten erfolgreich angelegt.");
    }
  } catch (e) {
    console.error("Fehler beim Initialisieren der Datenbank:", e);
  }
}
mongoose.connection.once('open', initDB);

// --- Routes ---
app.get('/api/data', async (req, res) => {
  try {
    const teams = await Team.find({}, '-_id -__v').lean();
    const users = await User.find({}, '-_id -__v').lean();
    const events = await Event.find({}, '-_id -__v').lean();
    const messages = await Message.find({}, '-_id -__v').sort({ id: -1 }).lean();
    const notifications = await Notification.find({}, '-_id -__v').sort({ id: -1 }).lean();

    res.json({ teams, users, events, messages, notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function addNotification(teamId, text, icon) {
  const maxNotif = await Notification.findOne().sort('-id');
  const newId = maxNotif ? maxNotif.id + 1 : 1;
  await new Notification({ id: newId, teamId, text, icon, date: new Date().toISOString() }).save();
}

app.post('/api/teams', async (req, res) => {
  try {
    const { name } = req.body;
    const maxTeam = await Team.findOne().sort('-id');
    const newId = maxTeam ? maxTeam.id + 1 : 1;
    const newTeam = await new Team({ id: newId, name }).save();
    res.json(newTeam);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const newEventData = req.body;
    const maxEvent = await Event.findOne().sort('-id');
    newEventData.id = maxEvent ? maxEvent.id + 1 : 1;
    newEventData.participants = { yes: 0, no: 0 };
    newEventData.playerDetails = [];
    newEventData.lineup = { isPublished: false, bench: [], captain: "", pitchPlayers: [] };

    const created = await new Event(newEventData).save();
    await addNotification(created.teamId, `Neuer Termin erstellt: ${created.title}`, "📅");
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const deletedEvent = await Event.findOneAndDelete({ id: eventId });
    if (!deletedEvent) return res.status(404).send('Not found');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const newUserData = req.body;
    const maxUser = await User.findOne().sort('-id');
    newUserData.id = maxUser ? maxUser.id + 1 : 1;
    if (!newUserData.role) newUserData.role = 'player';
    newUserData.goals = 0;
    newUserData.motmCount = 0;

    const created = await new User(newUserData).save();
    res.json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id/goals', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const amount = req.body.amount || 1;
    const user = await User.findOne({ id: userId });
    if (!user) return res.status(404).send("User not found");

    user.goals = Math.max(0, user.goals + amount);
    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/events/:id/result', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { home, away, isPlayed } = req.body;

    const event = await Event.findOne({ id: eventId });
    if (!event) return res.status(404).send('Not found');

    event.result = { home, away, isPlayed };
    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events/:id/match-events', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { type, player, minute } = req.body;

    const event = await Event.findOne({ id: eventId });
    if (!event) return res.status(404).send('Not found');

    if (!event.matchEvents) event.matchEvents = [];
    event.matchEvents.push({ type, player, minute: parseInt(minute), id: Date.now() });

    if (type === 'goal') {
      const user = await User.findOne({ name: player });
      if (user) {
        user.goals += 1;
        await user.save();
      }
    }

    event.markModified('matchEvents');
    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id/match-events/:matchEventId', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const matchEventId = parseInt(req.params.matchEventId);
    
    const event = await Event.findOne({ id: eventId });
    if (!event) return res.status(404).send('Not found');
    
    if (event.matchEvents) {
      const matchEventIndex = event.matchEvents.findIndex(me => me.id === matchEventId);
      if (matchEventIndex !== -1) {
        const removedEvent = event.matchEvents[matchEventIndex];
        event.matchEvents.splice(matchEventIndex, 1);
        
        if (removedEvent.type === 'goal') {
          const user = await User.findOne({ name: removedEvent.player });
          if (user) {
            user.goals = Math.max(0, user.goals - 1);
            await user.save();
          }
        }
        
        event.markModified('matchEvents');
        await event.save();
      }
    }
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/events/:id/status', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { username, status, reason } = req.body;

    const event = await Event.findOne({ id: eventId });
    if (!event) return res.status(404).send('Not found');

    const pIndex = event.playerDetails.findIndex(p => p.name === username);

    if (status === 'pending') {
      if (pIndex !== -1) event.playerDetails.splice(pIndex, 1);
    } else {
      if (pIndex !== -1) {
        event.playerDetails[pIndex].status = status;
        event.playerDetails[pIndex].reason = reason || "";
      } else {
        event.playerDetails.push({ name: username, status, reason: reason || "" });
      }
    }

    event.participants.yes = event.playerDetails.filter(p => p.status === 'yes').length;
    event.participants.no = event.playerDetails.filter(p => p.status === 'no').length;

    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/events/:id/cancel', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const event = await Event.findOne({ id: eventId });
    if (!event) return res.status(404).send('Not found');
    event.isCanceled = true;
    await event.save();
    await addNotification(event.teamId, `Termin abgesagt: ${event.title}`, "❌");
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/events/:id/motm', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { username } = req.body;

    const event = await Event.findOne({ id: eventId });
    if (!event) return res.status(404).send('Not found');

    if (event.motm && event.motm !== username) {
      const oldUser = await User.findOne({ name: event.motm });
      if (oldUser) {
        oldUser.motmCount = Math.max(0, oldUser.motmCount - 1);
        await oldUser.save();
      }
    }

    if (username && event.motm !== username) {
      const newUser = await User.findOne({ name: username });
      if (newUser) {
        newUser.motmCount += 1;
        await newUser.save();
      }
    }

    event.motm = username;
    await event.save();
    if (username) await addNotification(event.teamId, `Neuer Spieler des Spiels: ${username} 🏆`, "⭐️");
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages', async (req, res) => {
  try {
    const { text, author, teamId } = req.body;
    const maxMsg = await Message.findOne().sort('-id');
    const newId = maxMsg ? maxMsg.id + 1 : 1;

    const newMsg = new Message({
      id: newId,
      teamId: teamId || 1,
      text,
      author,
      date: new Date().toISOString(),
      reactions: {}
    });
    await newMsg.save();
    res.json(newMsg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/messages/:id', async (req, res) => {
  try {
    await Message.findOneAndDelete({ id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages/:id/react', async (req, res) => {
  try {
    const msgId = parseInt(req.params.id);
    const { emoji, username } = req.body;
    const msg = await Message.findOne({ id: msgId });
    if (!msg) return res.status(404).send('Not found');

    if (!msg.reactions) msg.reactions = {};
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];

    const userIndex = msg.reactions[emoji].indexOf(username);
    if (userIndex === -1) {
      msg.reactions[emoji].push(username);
    } else {
      msg.reactions[emoji].splice(userIndex, 1);
    }

    msg.markModified('reactions');
    await msg.save();
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/events/:id/lineup', async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const event = await Event.findOne({ id: eventId });
    if (!event) return res.status(404).send('Not found');

    const wasPublished = event.lineup ? event.lineup.isPublished : false;
    event.lineup = req.body;
    await event.save();

    if (req.body.isPublished && !wasPublished) {
      await addNotification(event.teamId, `Aufstellung für "${event.title}" wurde veröffentlicht!`, "📋");
    } else if (!req.body.isPublished && wasPublished) {
      // Delete the notification if it was unpublished
      await Notification.deleteMany({ text: `Aufstellung für "${event.title}" wurde veröffentlicht!` });
    }

    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log('Mongo Backend läuft auf http://localhost:3001');
});
