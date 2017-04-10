var static = require('node-static');
var http = require('http');
var file = new(static.Server)();

var app = http.createServer(function (req, res) {
  file.serve(req, res);
}).listen(3000);

var io = require('socket.io').listen(app);

console.log('server listening on port 3000');


io.on('connection', function (socket) {

  socket.on('message', function (message) {
    console.log('got message: ', message);
    socket.broadcast.to(message.channel).emit('message', message);
  });


  socket.on('create or join', function (room) {

    io.of('/').in(room).clients(function(error, clients) {
      var numClients = clients.length;

      console.log('Room ' + room + ' has ' + numClients + ' client(s)');
      console.log('Request to create or join room' + room);

      if (numClients == 0) {
        // First client joining...
        socket.join(room);
        socket.emit('created', room);
      } else if (numClients == 1) {
        // Second client joining...
        io.in(room).emit('join', room);
        socket.join(room);
        socket.emit('joined', room);
      } else {
        // max two clients
        socket.emit('full', room);
      }
    });
  });

});