import net, { Socket } from "net";

class MySocket {
  socket: Socket;
  nickname: string;

  constructor(socket: Socket, nickname: string) {
    this.socket = socket;
    this.nickname = nickname;
  }
}

const guestSockets: MySocket[] = [];
var port = 8085;
var guestId = 0;

var server = net.createServer(function (socket) {
  // Increment
  guestId++;

  const guestSocket = new MySocket(socket, "Guest" + guestId);
  var clientName = guestSocket.nickname;

  guestSockets.push(guestSocket);

  // Log it to the server output
  console.log(clientName + " joined this chat.");

  // Welcome user to the socket
  guestSocket.socket.write("Welcome to telnet chat!\n");

  // Broadcast to others excluding this socket
  broadcast(clientName, clientName + " joined this chat.\n");

  // When client sends data
  guestSocket.socket.on("data", function (data) {
    var message = clientName + "> " + data.toString() + "\n";

    broadcast(clientName, message);

    // Log it to the server output
    process.stdout.write(message);
  });

  // When client leaves
  guestSocket.socket.on("end", function () {
    var message = clientName + " left this chat\n";

    // Log it to the server output
    process.stdout.write(message);

    // Remove client from socket array
    removeSocket(guestSocket);

    // Notify all clients
    broadcast(clientName, message);
  });

  // When socket gets errors
  socket.on("error", function (error) {
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
    if (guestSocket.nickname === from) return;

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
server.listen(port, function () {
  console.log("Server listening at http://localhost:" + port);
});
