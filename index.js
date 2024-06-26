// © 2024 - BestDeveloper - BestMat, Inc. - All rights reserved.
import { createServer } from "http";
import crypto from "crypto";

const server = createServer(function(req, res) {
    res.writeHead(200);
    res.end("Nagapillaiyar");
}).listen(1337, () => {
    console.log("App running on Port 1337.")
});

const magicKey = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

server.on("upgrade", onSocketUpgrade);

function onSocketUpgrade(req, socket, head) {
    const { "sec-websocket-key": webClientSocketKey } = req.headers;
    console.log(`${webClientSocketKey} connected.`);

    const headers = prepareHandShakeHeaders(webClientSocketKey);
    socket.write(headers);

    socket.on("readable", () => onSocketReadable(socket));
}

const SEVEN_BITS_INTEGER_MARKER = 125; // Based on C/C++ Byte Chart in JavaScript.
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;

const FIRST_BIT = 128;
const MASK_KEY_BYTES_LENGTH = 4;
const OPCODE_TEXT = 0x01;
const MAXIMUM_SIXTEENBITS_INTEGER = 2 ** 16;

function onSocketReadable(socket) {
    socket.read(1); // Consume optcode (First Byte).

    // 1: 1 Byte - 8 Bits
    const [ markerAndPayloadLength ] = socket.read(1);
    const lengthIndicatiorInBits = markerAndPayloadLength - FIRST_BIT;

    /**
    * The first bit is always 1 for client to server messages.
    * Subtract one bit (128 or "100000000") from this byte to get rid of the Mask Bit.
    */

    let messageLength = 0;

    if (lengthIndicatiorInBits <= SEVEN_BITS_INTEGER_MARKER) {
        messageLength = lengthIndicatiorInBits;
    } else if (lengthIndicatiorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
        // Unsigned, Big Endian 16 Bit Integer [0 - 65K] - 2 ** 16: Check C (and C++) code for UINT Reference.
        messageLength = socket.read(2).readUint16BE(0);
    } else {
        console.error("BestDeveloper Error: Your message is too long.")
    }

    const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
    const encoded = socket.read(messageLength);
    const decoded = unMask(encoded, maskKey);
    const recived = decoded.toString("utf8");

    const data = JSON.parse(recived);
    const msg = JSON.stringify({
        message: data,
        at: new Date().toISOString()
    });
    sendMsg(msg, socket);

    console.log(`Message Recived: ${recived}`);
}

function prepareHandShakeHeaders(id) {
    const acceptKey = createSocketAccept(id);
    const headers = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${acceptKey}`,
        ""
    ].map(line => line.concat("\r\n")).join("");
    return headers;
}

function sendMsg(msg, socket) {
    socket.write(prepareMessage(msg));
}

function prepareMessage(message) {
    const msg = Buffer.from(message);
    const messageSize = msg.length;

    let dataFrameBuffer;
    let offset = 2;

    /**
     * 0x80 == 128 in JavaScript
     * "0x" + Math.abs(128).toString(16) == 0x80;
     */

    const firstByte = 0x80 | OPCODE_TEXT; // 0x80 | 0x01 (1 Bit in Binary) - Single Frame + Text (i.e. UTF-8 Encoding)
    if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
        const bytes = [firstByte];
        dataFrameBuffer = Buffer.from(bytes.concat(messageSize));
    } else if (messageSize <= MAXIMUM_SIXTEENBITS_INTEGER) {
        const offsetFourBytes = 4;
        const target = Buffer.allocUnsafe(offsetFourBytes);

        target[0] = firstByte;
        target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0; // Just to know the mask.
        
        target.writeUint16BE(messageSize, 2); // Content length is 2 Bytes.
        dataFrameBuffer = target;

        // Alloc 4 Bytes: [0] - 129
    } else {
        console.error("BestDeveloper Error: Message too long.");
    }

    const totalLength = dataFrameBuffer.byteLength + messageSize;
    const dataFrameResponse = concat([ dataFrameBuffer, msg ], totalLength);
    
    return dataFrameResponse;
}

function concat(bufferList, totalLength) {
    const target = Buffer.allocUnsafe(totalLength);
    let offset = 0;

    for (const buffer of bufferList) {
        target.set(buffer, offset);
        offset += buffer.length;
    }

    return target;
}

function unMask(encodedBuffer, maskKey) {
    const fillWithEightZeros = (t) => t.padStart(8, "0");
    const toBinary = (t) => fillWithEightZeros(t.toString(2));
    const fromBinaryToDecimal = (t) => parseInt(toBinary(t), 2)
    const getCharFromBinary = (t) => String.fromCharCode(fromBinaryToDecimal(t));

    const finalBuffer = Buffer.from(encodedBuffer);
    for (var i = 0; i < encodedBuffer.length; i++) {
        finalBuffer[i] = encodedBuffer[i] ^ maskKey[i % MASK_KEY_BYTES_LENGTH]
        const logger = {
            unmaskingCalc: `${toBinary(encodedBuffer[i])} ^ ${toBinary(maskKey[i % MASK_KEY_BYTES_LENGTH])} = ${toBinary(finalBuffer[i])}`,
            decoded: getCharFromBinary(finalBuffer[i])
        };

        console.log(logger);
    }

    /**
     * Mask Key has only **4 Bytes**.
     * index % 4 == 0, 1, 2, 3: index bits needed to **decode** the message.
     * XOR ^ also used as JavaScript.
     * XOR returns 1 if both are different.
     * XOR returns 0 if both are equal.
     * (71).toString(2).padStart(8, "0") == 01000111;
     * (52).toString(2).padStart(8, "0") == 00110101;
     *                                (114) 01110010; 
     * String.fromCharCode(parseInt("01110010", 2));
     * (71 ^ 53).toString(2).padStart(8, "0") = "01110010";
    */

    return finalBuffer;
}

function createSocketAccept(id) {
    const shaum = crypto.createHash("sha1");
    shaum.update(id + magicKey);

    return shaum.digest("base64");
}

["uncaughtException", "unhandleRejection"].forEach(function(event) {
    process.on(event, function (err) {
        console.error(`BestDeveloper Error: Uncaught JavaScript Exception. Event: ${event} and Message: ${err.stack || err}`);
    });
});
