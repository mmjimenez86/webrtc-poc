'use strict';

// Each browser has a different way of calling the getUserMedia method. Get the available one.
navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

// Event clean the window before leaving it
window.onbeforeunload = function() {
  hangup();
};


var sendMessageBtn = document.getElementById('sendMessageBtn');
var messageContainer = document.getElementById('messageContainer');
var nameInput = document.getElementById('myName');
var messageInput = document.getElementById('myMessage');

// Video HTML5 elements
var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

// Control flags
var isInitiator = false; // If current user is the one starting the communication.
var isStarted = false; // If the communication has already been started.
var isChannelReady = false;

// Data channels
var sendChannel, receiveChannel;


// WebRTC data structures
var peerConnection; // the variable in which the peer connection will be created.
var localStream, remoteStream; // the streams.

// Peer connection configuration depending on the browser
var pcConfig = {'iceServers': [{'url': 'stun:stun.l.google.com:19302'}]};
var pcConstraints = {video: true, audio: true};
var sdpConstraints = {};

// Connect to signaling server
var socket = io.connect("https://10.35.1.25:3000");

// Ask the user for a room name and join it
var room = prompt('Enter room name:');
if (room !== '') {
  console.log('Create or join room', room);

  navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    })
    .then(handleUserMedia)
    .catch(handleUserMediaError);

  socket.emit('create or join', room);
}


// --- Event management

/**
 * Handle the created event from the server.
 * In this case, the current peer is the initiator
 * (the communication has just been created).
 */
socket.on('created', function (room){
  console.log('Created room ' + room);
  isInitiator = true;
});

/**
 * Handle the case in which a room is full.
 */
socket.on('full', function (room){
  console.log('Room ' + room + ' is full');
});

/**
 * Handle when another peer is joining the channel.
 */
socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

/**
 * Handle when a second peer is joining the channel
 */
socket.on('joined', function (room){
  console.log('This peer has joined room ' + room);
  isChannelReady = true;
});


/**
 * Message received from another peer via the signaling server
 */
socket.on('message', function (message) {
  console.log('Received message:', message);
  if (message.type === 'got user media') {
    checkAndStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      checkAndStart();
    }
    peerConnection.setRemoteDescription(new RTCSessionDescription(message));
    answer();
  } else if (message.type === 'answer' && isStarted) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate(
      {
        sdpMLineIndex:message.label,
        candidate:message.candidate
      }
    );
    peerConnection.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

/**
 * Control chat button.
 */
sendMessageBtn.addEventListener('click', function () {
  // socket.emit('chat', { author: nameInput.value, message: messageInput.value }, room);
  displayMessage({ author: nameInput.value, message: messageInput.value });
  sendChannel.send(JSON.stringify({ author: nameInput.value, message: messageInput.value }));
});

/**
 * receive chat message.
 */
// socket.on('chat', function (data) {
//   displayMessage(data);
// });

// --- WebRTC related handlers

/**
 * Create a manage the peer connection.
 */
function createPeerConnection() {
  try {

    peerConnection = new RTCPeerConnection(pcConfig);

    peerConnection.onicecandidate = handleIceCandidate;
    peerConnection.onaddstream = handleRemoteStreamAdded;
    peerConnection.onremovestream = handleRemoteStreamRemoved;
    peerConnection.ondatachannel = gotReceiveChannel;

  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    return;
  }


  try {
    // Create a reliable data channel
    sendChannel = peerConnection.createDataChannel("sendDataChannel", { reliable: true });
    console.log('Created send data channel');
  } catch (e) {
    console.log('createDataChannel() failed with exception: ' + e.message);
  }

  sendChannel.onopen = handleChannelStateChange;
  sendChannel.onmessage = handleMessage;
  sendChannel.onclose = handleChannelStateChange;

}

/**
 * Create an offer
 */
function offer() {
  console.log('Creating Offer...');
  peerConnection.createOffer(sdpConstraints).then(setLocalAndSendMessage).catch(onSignalingError);
}

/**
 * Create an answer
 */
function answer() {
  console.log('Sending answer to peer.');
  peerConnection.createAnswer(sdpConstraints).then(setLocalAndSendMessage).catch(onSignalingError);
}

/**
 * Handle the ICE candidates.
 * @param event
 */
function handleIceCandidate(event) {
  console.log('handleIceCandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate});
  } else {
    console.log('End of candidates.');
  }
}

/**
 * Handle adding a remote stream.
 * @param event
 */
function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  attachMediaStream(remoteVideo, event.stream);
  console.log('Remote stream attached!!.');
  remoteStream = event.stream;
}

/**
 * Handle removing a remote stream.
 * @param event
 */
function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

/**
 * Handle the changes of the status of the data channel
 * (opening, closing, ...).
 */
function handleChannelStateChange() {
  var readyState = sendChannel.readyState;
  console.log('Send channel state is: ' + readyState);
  // if (readyState == "open") {
    // dataChannelSend.disabled = false;
    // dataChannelSend.focus();
    // dataChannelSend.placeholder = "";
    // sendButton.disabled = false;
  // } else {
    // dataChannelSend.disabled = true;
    // sendButton.disabled = true;
  // }
}


/**
 * Handle when a message arrives
 * @param event
 */
function handleMessage(event) {
  console.log('Received message: ' + event.data);
  displayMessage(JSON.parse(event.data));
}


function gotReceiveChannel(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = handleMessage;
  receiveChannel.onopen = handleChannelStateChange;
  receiveChannel.onclose = handleChannelStateChange;
}



// --- Auxiliary handlers

/**
 * Send message to the other peer via the signaling server
 */
function sendMessage(message) {
  console.log('Sending message: ', message);
  socket.emit('message', message, room);
}

/**
 * getUserMedia success callback.
 * @param stream The video stream from the user media.
 */
function handleUserMedia(stream) {
  localStream = stream;
  attachMediaStream(localVideo, stream);
  console.log('Adding local stream.');
  sendMessage({type: 'got user media'});
  if (isInitiator) {
    checkAndStart();
  }
}

/**
 * getUserMedia error callback.
 * @param error The error.
 */
function handleUserMediaError(error){
  console.log('navigator.getUserMedia error: ', error);
}

/**
 * Attach a video stream to the given HTML element.
 * @param elementToAttach The HTML element.
 * @param stream The video stream.
 */
function attachMediaStream(elementToAttach, stream) {
  elementToAttach.srcObject = stream;
}

/**
 *  Check if the peer connection has to be created.
 */
function checkAndStart() {
  if (!isStarted
    && typeof localStream != 'undefined'
    && isChannelReady) {

    createPeerConnection();
    peerConnection.addStream(localStream);
    isStarted = true;
    console.log('isInitiator: ' + isInitiator);
    if (isInitiator) {
      offer();
    }

  }
}

/**
 * Set description in offer and answer success callbacks.
 * @param sessionDescription
 */
function setLocalAndSendMessage(sessionDescription) {
  peerConnection.setLocalDescription(sessionDescription);
  sendMessage(sessionDescription);
}

/**
 * Handle signaling errors.
 * @param error
 */
function onSignalingError(error) {
  console.log('Failed to create signaling message : ' + error.name);
}

/**
 * Append chat message to the message area
 * @param message
 */
function displayMessage(message) {
  messageContainer.innerHTML = messageContainer.innerHTML
    + "<div><strong>"
    + message.author
    + ": </strong>"
    + message.message
    + "</div>";
}


// --- Clean up functions

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage({type: 'bye'});
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  if (sendChannel) {
    sendChannel.close();
  }
  if (receiveChannel) {
    receiveChannel.close();
  }
  if (peerConnection) {
    peerConnection.close();
  }
  peerConnection = null;
  // sendButton.disabled=true;
}
