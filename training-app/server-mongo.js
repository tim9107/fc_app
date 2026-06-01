import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = "mongodb+srv://tlangenauer_db_user:Test123467%21@cluster0.u4yfkok.mongodb.net/training_app?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB verbunden'))
  .catch(err => console.error('❌ MongoDB Verbindungsfehler:', err));

// --- Schemas ---
const UserSchema = new mongoose.Schema({
  id: Number,
  name: String,
  role: String
});
const User = mongoose.model('User', UserSchema);

const EventSchema = new mongoose.Schema({
  id: Number,
  date: String,
  time: String,
  location: String,
  type: String,
  title: String,
  coach: String,
  participants: { yes: { type: Number, default: 0 }, no: { type: Number, default: 0 } },
  playerDetails: [{ name: String, status: String, reason: String }]
});
const Event = mongoose.model('Event', EventSchema);

const LineupSchema = new mongoose.Schema({
  docId: { type: String, default: "global" },
  starters: [String],
  bench: [String],
  captain: String,
  pitchPlayers: [{ name: String, x: Number, y: Number }]
});
const Lineup = mongoose.model('Lineup', LineupSchema);

// --- Initialization ---
async function initDB() {
  const userCount = await User.countDocuments();
  if (userCount === 0) {
    console.log("Initialisiere Beispieldaten in MongoDB...");
    const d = new Date();
    const getOffsetDateStr = (offset) => {
      const nd = new Date(d);
      nd.setDate(nd.getDate() + offset);
      return nd.toISOString().split('T')[0];
    };

    await User.insertMany([
      { id: 1, name: 'Tim', role: 'player' },
      { id: 2, name: 'Lars Müller', role: 'player' },
      { id: 3, name: 'Jan Schmid', role: 'player' },
      { id: 4, name: 'Raffi', role: 'coach' },
      { id: 5, name: 'Admin', role: 'admin' }
    ]);

    await Event.insertMany([
      {
        id: 1, date: getOffsetDateStr(0), time: "19:30 - 21:00", location: "Sporthalle Mitte",
        type: "Training", title: "Taktik & Ausdauer", coach: "Raffi",
        participants: { yes: 1, no: 1 },
        playerDetails: [
          {name: "Lars Müller", status: "no", reason: "Verletzt"},
          {name: "Jan Schmid", status: "yes", reason: ""}
        ]
      },
      {
        id: 2, date: getOffsetDateStr(3), time: "15:00 - 17:00", location: "Stadion Süd",
        type: "Spiel", title: "Heimspiel vs. FC Basel", coach: "Raffi",
        participants: { yes: 0, no: 0 }, playerDetails: []
      }
    ]);

    await new Lineup({ docId: "global", starters: [], bench: [], captain: "", pitchPlayers: [] }).save();
    console.log("Beispieldaten erfolgreich angelegt.");
  }
}
mongoose.connection.once('open', initDB);

// --- Routes ---
app.get('/api/data', async (req, res) => {
  try {
    const users = await User.find({}, '-_id -__v').lean();
    const events = await Event.find({}, '-_id -__v').lean();
    let lineup = await Lineup.findOne({ docId: "global" }, '-_id -__v').lean();
    
    if (!lineup) {
      lineup = { starters: [], bench: [], captain: "", pitchPlayers: [] };
    }

    res.json({ users, events, lineup });
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
    
    const created = await new Event(newEventData).save();
    res.json(created);
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
    
    const created = await new User(newUserData).save();
    res.json(created);
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
    
    // Recalculate
    event.participants.yes = event.playerDetails.filter(p => p.status === 'yes').length;
    event.participants.no = event.playerDetails.filter(p => p.status === 'no').length;
    
    await event.save();
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/lineup', async (req, res) => {
  try {
    let lineup = await Lineup.findOne({ docId: "global" });
    if (!lineup) {
      lineup = new Lineup({ docId: "global" });
    }
    lineup.starters = req.body.starters || [];
    lineup.bench = req.body.bench || [];
    lineup.captain = req.body.captain || "";
    lineup.pitchPlayers = req.body.pitchPlayers || [];
    
    await lineup.save();
    res.json(lineup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => {
  console.log('Mongo Backend läuft auf http://localhost:3001');
});
