import net, { Socket } from "net";
import { ConnectionHelper } from "./helpers/connectionHelper";
import { IUser, UserModel } from "./models/user";
import bcrypt from "bcrypt";
import { IRoom, RoomModel } from "./models/room";

class MySocket {
  socket: Socket;
  nickname: string;
  isLoggedIn: boolean;
  user?: IUser;
  currentRoomName: string;
  availableRooms: IRoom[];

  constructor(socket: Socket, nickname: string) {
    this.socket = socket;
    this.nickname = nickname;
    this.isLoggedIn = false;
    this.user = undefined;
    this.currentRoomName = "";
    this.availableRooms = [];
  }

  joinRoom(roomName: string) {
    if (!this.availableRooms.some((room) => room.roomName === roomName)) {
      this.socket.write("You cannot join this room");
      return;
    }

    this.currentRoomName = roomName;

    let sockets = roomSockets.get(roomName);

    if (!sockets) {
      roomSockets.set(roomName, [this]);
    } else {
      sockets.push(this);
    }

    this.socket.write(`You joined ${roomName}\n`);
    return;
  }

  sendMessage(message: string) {
    const socketsToSend = roomSockets
      .get(this.currentRoomName)
      ?.filter((s) => s.currentRoomName === this.currentRoomName);

    if (socketsToSend) {
      socketsToSend.forEach((socket) => {
        if (socket.nickname === this.nickname) return;

        socket.socket.write(this.nickname + "> " + message + "\n");
      });
    }
  }
}

const guestSockets: MySocket[] = [];
const publicRooms: IRoom[] = [];
let GeneralRoom: IRoom = {} as IRoom;
const roomSockets: Map<string, MySocket[]> = new Map<"general", []>();

var port = 8085;
var guestId = 0;

var server = net.createServer(function (socket) {
  // Increment
  guestId++;

  const guestSocket = new MySocket(socket, "Guest" + guestId);

  guestSockets.push(guestSocket);

  // Welcome user to the socket
  guestSocket.socket.write("Welcome to telnet chat!\n");

  // Broadcast to others excluding this socket
  broadcast(
    guestSocket.nickname,
    guestSocket.nickname + " joined general chat.\n"
  );

  // When client sends data
  guestSocket.socket.on("data", async function (data) {
    const dataString = data.toString().trim();

    if (dataString.startsWith("/login")) {
      if (guestSocket.isLoggedIn) {
        guestSocket.socket.write("You are already logged in.\n");
        return;
      }

      const nickname = dataString.split(" ")[1];
      const password = dataString.split(" ")[2];

      const user = await UserModel.findOne({ nickname });

      if (!user) {
        if (await UserModel.exists({ nickname })) {
          guestSocket.socket.write("Nickname is already taken.\n");
          return;
        }

        const newUser = await UserModel.create({
          nickname,
          password: await bcrypt.hash(password, 10),
        });
        GeneralRoom.participants.push(newUser._id);
        await GeneralRoom.save();

        const allOtherUsers = await UserModel.find({
          nickname: { $ne: nickname },
        });

        for (const otherUser of allOtherUsers) {
          const newRoom = await RoomModel.create({
            roomName: `${newUser.nickname}-${otherUser.nickname}`,
            participants: [newUser._id, otherUser._id],
            isPublic: false,
            isDual: true,
          });

          guestSocket.availableRooms.push(newRoom);
        }

        guestSocket.availableRooms.push(...publicRooms);
        guestSocket.isLoggedIn = true;
        guestSocket.user = newUser;
        guestSocket.nickname = newUser.nickname;
        guestSocket.currentRoomName = "general";
        guestSocket.socket.write("You are now registered!\n");
        let message = "You can join those rooms by typing '/join roomName'\n";
        guestSocket.availableRooms.forEach(
          (room, index) => (message += `${index} - ${room.roomName}\n`)
        );
        guestSocket.socket.write(message);
        return;
      }

      const isPasswordCorrect = await bcrypt.compare(password, user.password);

      if (isPasswordCorrect) {
        const allOtherUsers = await UserModel.find({
          nickname: { $ne: nickname },
        });

        for (const otherUser of allOtherUsers) {
          let room = await RoomModel.findOne({
            isDual: true,
            $or: [
              {
                participants: [user._id, otherUser._id],
              },
              {
                participants: [otherUser._id, user._id],
              },
            ],
          });

          if (!room) {
            room = await RoomModel.create({
              roomName: `${user.nickname}-${otherUser.nickname}`,
              participants: [user._id, otherUser._id],
              isPublic: false,
              isDual: true,
            });
          }

          guestSocket.availableRooms.push(room);
        }

        guestSocket.availableRooms.push(...publicRooms);
        guestSocket.isLoggedIn = true;
        guestSocket.user = user;
        guestSocket.nickname = user.nickname;
        guestSocket.currentRoomName = "general";
        roomSockets.get("general")!.push(guestSocket);
        guestSocket.socket.write("You are now logged in!\n");
        let message = "You can join those rooms by typing '/join roomName'\n";
        guestSocket.availableRooms.forEach(
          (room, index) => (message += `${index} - ${room.roomName}\n`)
        );
        guestSocket.socket.write(message);
        return;
      }

      guestSocket.socket.write("Wrong password!\n");
    }

    if (!guestSocket.isLoggedIn) {
      guestSocket.socket.write("You are not logged in.\n");
      return;
    }

    if (dataString.startsWith("/join")) {
      const roomName = dataString.split(" ")[1];
      guestSocket.joinRoom(roomName);
      return;
    }

    if (dataString.startsWith("/list")) {
      let message = "You can join those rooms by typing '/join roomName'\n";
      guestSocket.availableRooms.forEach(
        (room, index) => (message += `${index} - ${room.roomName}\n`)
      );
      guestSocket.socket.write(message);
      return;
    }

    guestSocket.sendMessage(dataString);

    // var message = guestSocket.nickname + "> " + data.toString() + "\n";
  });

  // When client leaves
  guestSocket.socket.on("end", function () {
    var message = guestSocket.nickname + " left this chat\n";

    // Log it to the server output
    process.stdout.write(message);

    // Remove client from socket array
    removeSocket(guestSocket);

    // Notify all clients
    broadcast(guestSocket.nickname, message);
  });

  // When socket gets errors
  guestSocket.socket.on("error", function (error) {
    console.log("Socket got problems: ", error.message);
  });
});

// Broadcast to others, excluding the sender
function broadcast(from: string, message: string) {
  // If there are no sockets, then don't broadcast any messages
  if (guestSockets.length === 0) {
    process.stdout.write("Everyone left the chat");
    return;
  }

  // If there are clients remaining then broadcast message
  guestSockets.forEach(function (guestSocket, index, array) {
    // Dont send any messages to the sender
    if (guestSocket.nickname === from) {
      return;
    }

    guestSocket.socket.write(message);
  });
}

function sendMessage(from: string, to: string, message: string) {
  // If there are no sockets, then don't broadcast any messages
  if (guestSockets.length === 0) {
    process.stdout.write("Everyone left the chat");
    return;
  }

  // If there are clients remaining then broadcast message
  guestSockets.forEach(function (guestSocket, index, array) {
    // Dont send any messages to the sender
    if (guestSocket.nickname === from) {
      return;
    }

    guestSocket.socket.write(message);
  });
}

// Remove disconnected client from sockets array
function removeSocket(socket: MySocket) {
  guestSockets.splice(guestSockets.indexOf(socket), 1);
}

// Listening for any problems with the server
server.on("error", function (error) {
  console.log("So we got problems!", error.message);
});

// Listen for a port to telnet to
// then in the terminal just run 'telnet localhost [port]'

async function main() {
  await ConnectionHelper.connect();

  let generalRoom = await RoomModel.findOne({ roomName: "general" });
  if (!generalRoom) {
    generalRoom = await RoomModel.create({
      roomName: "general",
      participants: [],
      isPublic: true,
      isDual: false,
    });
  }
  GeneralRoom = generalRoom;

  publicRooms.push(
    ...(await RoomModel.find({ isPublic: true, isDual: false }))
  );
  publicRooms.forEach((room) => roomSockets.set(room.roomName, []));

  server.listen(port, function () {
    console.log("Server listening at http://localhost:" + port);
  });
}

main();
