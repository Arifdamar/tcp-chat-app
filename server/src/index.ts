import net, { Socket } from "net";
import { ConnectionHelper } from "./helpers/connectionHelper";
import { IUser, UserModel } from "./models/user";
import bcrypt from "bcrypt";
import { IRoom, RoomModel } from "./models/room";
import MessageModel from "./models/message";

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

  async joinRoom(roomName: string) {
    let roomToJoin: IRoom | undefined | null = this.availableRooms.find(
      (room) => room.roomName === roomName
    );
    if (!roomToJoin) {
      this.socket.write("You cannot join this room");
      return;
    }

    // leave the current room
    if (this.currentRoomName !== "") {
      const sockets = roomSockets.get(this.currentRoomName);

      if (sockets) {
        sockets.splice(sockets.indexOf(this), 1);
      }

      sockets?.forEach((socket) => {
        if (socket.nickname === this.nickname) return;

        socket.socket.write(this.nickname + " left channel!\n");
      });
    }

    this.currentRoomName = roomName;

    let sockets = roomSockets.get(roomName);

    if (!sockets) {
      roomSockets.set(roomName, [this]);
    } else {
      sockets.push(this);
    }

    sockets?.forEach((socket) => {
      if (socket.nickname === this.nickname) return;

      socket.socket.write(this.nickname + " joined channel!\n");
    });

    roomToJoin = await RoomModel.findOne({ _id: roomToJoin._id })
      .populate({
        path: "messages",
        populate: {
          path: "from",
        },
      })
      .exec();

    let updateMessagePromises: Promise<any>[] = [];

    const unreadMessages = roomToJoin?.messages.filter(
      (msg) => !msg.receivers.includes(this.user!._id)
    );

    let unreadMessagesText = "";

    if (unreadMessages) {
      for (const msg of unreadMessages) {
        updateMessagePromises.push(
          MessageModel.updateOne(
            { _id: msg._id },
            { $push: { receivers: this.user!._id } }
          ).exec()
        );

        const user = await UserModel.findById(msg.from, { nickname: 1 });

        unreadMessagesText += `${user?.nickname}> ${msg.message}\n`;
      }
    }

    await Promise.all(updateMessagePromises);

    this.socket.write(`You joined ${roomName}\n`);
    this.socket.write(unreadMessagesText);
    return;
  }

  async sendMessage(message: string) {
    const socketsToSend = roomSockets
      .get(this.currentRoomName)
      ?.filter((s) => s.currentRoomName === this.currentRoomName);

    const roomToMessage = this.availableRooms.find(
      (r) => r.roomName === this.currentRoomName
    )!;

    await roomToMessage.populate("participants");
    const receivers = [];

    for (const participant of roomToMessage.participants) {
      const socs =
        roomToMessage.roomName === "general" ? guestSockets : socketsToSend;

      const isReceived = socs?.some((s) => s.nickname === participant.nickname);

      if (isReceived) {
        receivers.push(participant);
      }
    }

    const messageObject = await MessageModel.create({
      from: this.user!.id,
      to: roomToMessage.id,
      receivers: receivers.map((u) => u._id),
      message: message,
    });

    roomToMessage.messageIds.push(messageObject._id);
    await roomToMessage.save();

    if (roomToMessage.roomName === "general") {
      guestSockets.forEach((socket) => {
        if (socket.nickname === this.nickname) return;

        socket.socket.write(this.nickname + "> " + message + "\n");
      });
    } else {
      if (socketsToSend) {
        socketsToSend.forEach((socket) => {
          if (socket.nickname === this.nickname) return;

          socket.socket.write(this.nickname + "> " + message + "\n");
        });
      }
    }

    return;
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
        GeneralRoom.participantIds.push(newUser._id);
        await GeneralRoom.save();

        const allOtherUsers = await UserModel.find({
          nickname: { $ne: nickname },
        });

        for (const otherUser of allOtherUsers) {
          const newRoom = await RoomModel.create({
            roomName: `${newUser.nickname}-${otherUser.nickname}`,
            participantIds: [newUser._id, otherUser._id],
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
          (room) => (message += `${room.roomName}\n`)
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
                participantIds: [user._id, otherUser._id],
              },
              {
                participantIds: [otherUser._id, user._id],
              },
            ],
          }).populate("messages");

          if (!room) {
            room = await RoomModel.create({
              roomName: `${user.nickname}-${otherUser.nickname}`,
              participantIds: [user._id, otherUser._id],
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
        guestSocket.socket.write("You are now logged in!\n");
        let message = "You can join those rooms by typing '/join roomName'\n";

        for (const r of guestSocket.availableRooms) {
          const unreadMessages = r.messages
            ? r.messages?.filter(
                (m) => !m.receivers.includes(guestSocket.user!._id)
              ).length
            : 0;

          message += `${r.roomName} ${
            unreadMessages > 0
              ? "- " +
                unreadMessages +
                " new " +
                (unreadMessages === 1 ? "message" : "messages")
              : ""
          } \n`;
        }

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
      await guestSocket.joinRoom(roomName);
      return;
    }

    if (dataString.startsWith("/list")) {
      let message = "You can join those rooms by typing '/join roomName'\n";
      guestSocket.availableRooms = [];
      guestSocket.availableRooms = await RoomModel.find({
        participantIds: { $in: guestSocket.user!._id },
      }).populate("messages");

      for (const r of guestSocket.availableRooms) {
        const unreadMessages = r.messages.filter(
          (m) => !m.receivers.includes(guestSocket.user!._id)
        ).length;
        message += `${r.roomName} ${
          unreadMessages > 0
            ? "- " +
              unreadMessages +
              " new " +
              (unreadMessages === 1 ? "message" : "messages")
            : ""
        } \n`;
      }

      guestSocket.socket.write(message);
      return;
    }

    await guestSocket.sendMessage(dataString);

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
      participantIds: [],
      isPublic: true,
      isDual: false,
    });
  }
  GeneralRoom = generalRoom;

  publicRooms.push(
    ...(await RoomModel.find({ isPublic: true, isDual: false }).populate(
      "messages"
    ))
  );
  publicRooms.forEach((room) => roomSockets.set(room.roomName, []));

  server.listen(port, function () {
    console.log("Server listening at http://localhost:" + port);
  });
}

main();
