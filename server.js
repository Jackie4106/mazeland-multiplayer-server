const express = require('express');
const { Server } = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX = '/index.html'; // We won't really use this if hosting HTML elsewhere, but good for health checks

// 1. Setup Express (mainly to keep Heroku happy and bind the port)
const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

// 2. Setup WebSocket Server
const wss = new Server({ server });

// Store players: rooms[roomName][playerId] = websocketClient
const rooms = {};

wss.on('connection', (ws) => {
  // Temporary storage for this connection's details
  let currentRoom = null;
  let currentId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // --- HANDLE JOIN ---
      if (data.type === 'join') {
        const { room, id, tag } = data;
        
        currentRoom = room;
        currentId = id;

        // Create room if it doesn't exist
        if (!rooms[room]) {
          rooms[room] = {};
        }

        // Add player to room
        // We store the WS connection plus their data
        rooms[room][id] = { ws, id, tag };

        console.log(`Player ${id} (Tag: ${tag}) joined room: ${room}`);
        
        // (Optional) Send existing players to the new joiner immediately
        // The client handles this via 'move' updates, but we could send a 'state' packet here if we stored positions server-side.
        // For now, we rely on the client's continuous "move" broadcast to populate the world.
      }

      // --- HANDLE MOVEMENT & SHOOTING ---
      if (data.type === 'move' || data.type === 'shoot') {
        // Broadcast to everyone else in the SAME room
        if (currentRoom && rooms[currentRoom]) {
          const roomPlayers = rooms[currentRoom];
          const payload = JSON.stringify(data);

          Object.keys(roomPlayers).forEach((playerId) => {
            const client = roomPlayers[playerId];
            // Don't send back to self, and ensure connection is open
            if (playerId !== currentId && client.ws.readyState === 1) { // 1 = OPEN
              client.ws.send(payload);
            }
          });
        }
      }

    } catch (e) {
      console.error("Error parsing message:", e);
    }
  });

  // --- HANDLE DISCONNECT ---
  ws.on('close', () => {
    if (currentRoom && currentId && rooms[currentRoom]) {
      console.log(`Player ${currentId} left room ${currentRoom}`);
      
      // Remove from room storage
      delete rooms[currentRoom][currentId];

      // Broadcast "leave" message to others in the room
      const leaveMsg = JSON.stringify({ type: 'leave', id: currentId });
      const roomPlayers = rooms[currentRoom];
      
      if (roomPlayers) {
        Object.keys(roomPlayers).forEach((playerId) => {
          const client = roomPlayers[playerId];
          if (client.ws.readyState === 1) {
            client.ws.send(leaveMsg);
          }
        });
        
        // Clean up empty room
        if (Object.keys(rooms[currentRoom]).length === 0) {
          delete rooms[currentRoom];
        }
      }
    }
  });
});
