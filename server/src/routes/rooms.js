const router = require('express').Router();
const mongoose = require('mongoose');
const Room = mongoose.model('Room');
const Team = mongoose.model('Team');

const sockets = require('../wss-clients');
const catchErrors = require('../middleware/catch-errors');
const { SCOREBOARD, TEAM, QM } = require('./roles');
const { generateRoomCode } = require('../rooms/code');

const verifyQuizzMaster = (req, res, next) => {
  if (req.sessionID !== req.room.host) {
    return res.status(400).json({ message: 'You are not allowed to perform this action.' });
  }

  next();
};

//#region rooms
router.post(
  '/',
  catchErrors(async (req, res) => {
    if (req.session.roomID) {
      await Room.updateOne({ _id: req.session.roomID, ended: false }, { ended: true });
    }
    req.session.role = QM;

    const code = generateRoomCode();
    const newlyCreatedRoom = new Room({ code, host: req.sessionID });
    await newlyCreatedRoom.save();
    req.session.roomID = newlyCreatedRoom._id;

    req.session.save(() => {
      res.json({ roomCode: code });
    });
  })
);

router.use(
  '/:roomCode',
  catchErrors(async (req, res, next) => {
    req.room = await Room.findOne({ code: req.params.roomCode, ended: false });

    if (!req.room) {
      return res.status(404).json({ message: 'Invalid room code.' });
    }

    next();
  })
);

router.get('/:roomCode', (req, res) => {
  // if client hasn't a session yet, a session will be created with the scoreboard role.
  if (!req.sessionID) {
    req.session.role = SCOREBOARD;
    req.session.roomID = req.room._id;
  }

  // @TODO
  res.send('Not implemented yet!');
});

router.patch(
  '/:roomCode',
  verifyQuizzMaster,
  catchErrors(async (req, res) => {
    await Room.findByIdAndUpdate(req.room._id, req.body);

    res.json(JSON.stringify(req.room));
  })
);

router.delete(
  '/:roomCode',
  verifyQuizzMaster,
  catchErrors(async (req, res) => {
    req.room.ended = true;
    await req.room.save();
    res.json({ message: 'Room has been ended.' });
  })
);
//#endregion

//#region applications
router.get('/:roomCode/applications', verifyQuizzMaster, (req, res) => {
  const applications = req.room.applications.map(({ _id, name }) => ({ id: _id, name }));
  res.json(JSON.stringify(applications));
});

router.post(
  '/:roomCode/applications',
  catchErrors(async (req, res) => {
    const { name } = req.body;
    const { roomClosed, teams, applications } = req.room;

    if (roomClosed) {
      return res.status(404).json({ message: 'This room is closed.' });
    }

    if (!name) {
      return res.status(404).json({ message: 'Invalid team name.' });
    }

    if (teams.some(team => team.name === name) || applications.some(team => team.name === name)) {
      return res.status(404).json({ message: 'Team name is already in use.' });
    }

    req.session.role = TEAM;
    req.session.name = name;
    req.session.roomID = req.room._id;

    const newApplication = new Team({ sessionID: req.sessionID, name });
    await newApplication.save();

    req.room.applications.push(newApplication);
    await req.room.save();

    req.session.save(() => {
      res.json({ message: 'Team application received.' });
    });
  })
);

router.delete(
  '/:roomCode/applications/:applicationID',
  verifyQuizzMaster,
  catchErrors(async (req, res) => {
    const applicationDocument = req.room.applications.id(req.params.applicationID);

    if (!applicationDocument) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    applicationDocument.remove();
    await req.room.save();

    sockets.get(applicationDocument.sessionID).send('APPLICATION_REJECTED');
    res.json({ message: 'Application has been rejected.' });
  })
);
//#endregion

//#region teams
router.post(
  '/:roomCode/teams',
  verifyQuizzMaster,
  catchErrors(async (req, res) => {
    if (req.room.teams.length >= 6) {
      return res.status(400).json({ message: 'Maximum number of teams reached.' });
    }

    const applicationDocument = req.room.applications.id(req.body.applicationID);

    if (!applicationDocument) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    const team = await Team.findById(req.body.applicationID);

    req.room.teams.push(team);
    applicationDocument.remove();
    await req.room.save();

    sockets.get(applicationDocument.sessionID).send('APPLICATION_ACCEPTED');
    res.json({ message: 'Team has been approved.' });
  })
);

router.patch(
  '/:roomCode/teams/:teamID',
  catchErrors(async (req, res) => {
    if (req.sessionID === req.room.host) {
      // TODO: Implement Quizz Master guessCorrect toggle
      return res.send('Quizz Master!');
    }

    const team = req.room.teams.find(team => team.sessionID === req.sessionID);

    if (team) {
      if (req.params.teamID !== team.sessionID) {
        return res.status(400).json({ message: 'This is not your team!' });
      }

      const teamDocument = await Team.findById(team._id);

      team.guess = req.body.guess;
      teamDocument.guess = req.body.guess;

      // TODO: PING Quizz Master socket here
      return res.json({ message: 'Guess submitted!' });
    }

    return res.status(400).json({ message: 'You are not allowed to perform this action.' });
  })
);
//#endregion

//#region categories
router.post('/:roomCode/categories', (req, res) => {
  // @TODO
  res.send('Not implemented yet!');
});

router.delete('/:roomCode/categories/:categoryID', (req, res) => {
  // @TODO
  res.send('Not implemented yet!');
});
//#endregion

module.exports = router;
