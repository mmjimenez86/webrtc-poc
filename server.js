var static = require('node-static');
var http = require('https');
var fs = require('fs');
var file = new(static.Server)();

var options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

var app = http.createServer(options, function (req, res) {
  file.serve(req, res);
}).listen(3000);

var io = require('socket.io').listen(app);

console.log('server listening on port 3000');


io.on('connection', function (socket) {

  socket.on('message', function (message, room) {
    console.log('got message: ', message);
    console.log('sending message to room: ' + room)
    socket.broadcast.to(room).emit('message', message);
  });


  socket.on('create or join', function (room) {

    io.of('/').in(room).clients(function(error, clients) {
      var numClients = clients.length;

      console.log('Room ' + room + ' has ' + numClients + ' client(s)');
      console.log('Request to create or join room ' + room);

      if (numClients == 0) {
        // First client joining...
        socket.join(room);
        console.log('Client ID ' + socket.id + ' created room ' + room);
        socket.emit('created', room, socket.id);
      } else if (numClients == 1) {
        // Second client joining...
        console.log('Client ID ' + socket.id + ' joined room ' + room);
        socket.broadcast.to(room).emit('join', room);
        socket.join(room);
        socket.emit('joined', room, socket.id);
        // socket.broadcast.to(room).emit('ready', room);
      } else {
        // max two clients
        socket.emit('full', room);
      }
    });
  });

  // socket.on('chat', function (message, room) {
  //   console.log('chat message: ', message);
  //   io.in(room).emit('chat', message);
  // });

  socket.on('bye', function(){
    console.log('received bye');
  });

});