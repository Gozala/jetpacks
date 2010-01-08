// globals
var global = this;
var console = console;
function print() console.log(Array.prototype.join.call(arguments, " ") + "\n");
var CC = Components.Constructor;
var Cc = Components.classes;
var Ci = Components.interfaces;
var Cu = Components.utils;
// simple commonjs module loader
function require(id) {
    try {
        if (!require.modules[id]) require.factories[id].call(this, require.modules[id] = {});
        return require.modules[id];
    } catch(e) {
        print(id);
        throw e;
    }
}
require.register = function(id, factory) require.factories[id] = factory;
require.modules = {};
require.factories = {};

/* socket */ require.register("socket", function(exports) {
var IO = require("IO").IO;
var Server = CC("@mozilla.org/network/server-socket;1", "nsIServerSocket", "init");
var TransportSevice = Cc["@mozilla.org/network/socket-transport-service;1"].getService(Ci.nsISocketTransportService);
var SocketTranport = Ci.nsISocketTransport;
var Pump = CC("@mozilla.org/network/input-stream-pump;1", "nsIInputStreamPump", "init");
var Pipe = CC("@mozilla.org/pipe;1", "nsIPipe", "init");

var CONNECTING = 0; //The connection has not yet been established
var OPEN = 1; //Socket connection is established and communication is possible
var CLOSED = 2; //The connection has been closed or could not be opened


var Socket = exports.Socket = function Socket() {};
Socket.prototype = new IO();
Socket.prototype.readyState = CONNECTING;
Socket.prototype.constructor = Socket;
Socket.prototype.__defineGetter__("host", function() {
    return this.__transport__ ? this.__transport__.host : undefined;
});
Socket.prototype.__defineGetter__("port", function() {
    return this.__transport__ ? this.__transport__.port : undefined;
});
Socket.prototype.open = function open(host, port) {
    ['Opens the socket for communication\
    @param host:String      The host to connect to\
    @param port:Number      The port on which to connect']
    var transport = this.__transport__ = this.__transport__ || TransportSevice.createTransport(null, 0, host, port, null);
    var stateSync = new StateSync(this);
    var pipe = new Pipe(true, true, 0, 0, null);
    var rawInput = transport.openInputStream(0, 0, 0);
    this._inputBuffer = new IO(rawInput, null);
    this._outputBuffer = new IO(null, pipe.outputStream);
    this.inputStream = pipe.inputStream;
    this.outputStream = transport.openOutputStream(/*Ci.nsITransport.OPEN_BLOCKING*/0, 0, 0);
    var pump = new Pump(rawInput, -1, -1, 0, 0, false);
    pump.asyncRead(new StreamBufferrer(this), null);
};
Socket.prototype.onopen = function onopen() {
    ['triggered when connection is established and communication is possible\
    this method is supposed to be overrided by socket server users']
};
Socket.prototype.onmessage = function onmessage() {
    ['triggered when new data is arrived from the peer\
    this method is supposed to be overrided by socket user']
};
Socket.prototype.close = function close() {
    ['Opens the socket for communication']
    IO.prototype.close.call(this);
    this._inputBuffer.close();
    this._outputBuffer.close();
    this.__transport__.close(0);
};
Socket.prototype.onclose = function onclose() {
    ['triggered when connection has been closed.\
    this method is supposed to be overrided by socket server users']
};

function StreamBufferrer(socket) {
    this.socket = socket;
}
StreamBufferrer.prototype = {
    constructor: StreamBufferrer,
    onStartRequest: function(request, context) {},
    onStopRequest: function(request, context, status) {
        var socket = this.socket;
        socket.readyState = CLOSED;
        socket.onclose();
    },
    onDataAvailable: function(request, context, stream, offset, count) {
        var socket = this.socket;
        socket._inputBuffer.copy(socket._outputBuffer);
        socket.onmessage();
    }
};
function StateSync(socket) {
    this.socket = socket;
    socket.__transport__.setEventSink(this, null);
}
StateSync.prototype = {
    constructor: StateSync,
    onTransportStatus: function(transport, status, progress, total) {
        var readyState, socket = this.socket;
        switch (status) {
            case SocketTranport.STATUS_RESOLVING:
            case SocketTranport.STATUS_CONNECTING_TO:
                readyState = CONNECTING;
                break;
            case SocketTranport.STATUS_CONNECTED_TO:
            case SocketTranport.STATUS_SENDING_TO:
            case SocketTranport.STATUS_WAITING_FOR:
            case SocketTranport.STATUS_RECEIVING_FROM:
                readyState = OPEN;
                break;
        }
        if (readyState == OPEN && socket.readyState == CONNECTING) {
            socket.readyState = OPEN;
            socket.onopen();
        }
    }
};

var ServerSocket = exports.ServerSocket = function ServerSocket() {
    if (!(this instanceof ServerSocket)) return new ServerSocket();
};
ServerSocket.prototype = {
    constructor: Server,
    listen: function listen(port, loopbackOnly, backLog) {
        ['server socket that can accept incoming connections.\
        @param String(port)=8080\
            The port of the server socket.\
        @param loopbackOnly:Boolean=true\
            If true, the server socket will only respond to connections on the\
            local loopback interface. Otherwise, it will accept connections\
            from any interface.  To specify a particular network interface.\
        @param ?backLog:Numeber']

        loopbackOnly = (loopbackOnly !== false);
        backLog = backLog || -1;
        var server = this;
        var __server__ = this.__server__ = new Server(port, loopbackOnly, backLog);
        __server__.asyncListen({
            onSocketAccepted: function(__server__, transport) {
                ['This method is called when a client connection is accepted.\
                Processes an incoming request coming in on the given socket and contained\
                in the given transport.\
                @param socket:nsIServerSocket           the socket request was served with\
                @param transport:nsISocketTransport     the transport for the request/response\
                @see nsIServerSocketListener.onSocketAccepted']

                var socket = new Socket();
                socket.onopen  = server.onopen;
                socket.onmessage = server.onmessage;
                socket.onclose = server.onclose;
                socket.__transport__ = transport;
                socket.readyState = OPEN;
                socket.open();
                socket.onopen();
            },
            onStopListening: function(server, socket) {
                ['This method is called when the listening socket stops for some reason.\n\
                The server socket is effectively dead after this notification.\
                @param {nsIServerSocket} server             The server socket.\
                @param {nsresult} status                    The reason why the\
                    server socket stopped listening.  If the server socket was\
                    manually closed, then this value will be NS_BINDING_ABORTED.']
            }
        });
    },
    onopen: Socket.prototype.onopen,
    onmessage: Socket.prototype.onmesssage,
    onclose: Socket.prototype.onclose,
    close: function() {
        ['Triggered when connection is stopped\
        @param {Connection} connection - stopped connection']

        this.__server__.close();
    },

};});
/* IO */require.register("IO", function(exports) {
var Pipe = CC("@mozilla.org/pipe;1", "nsIPipe", "init");
var BinaryOutputStream = CC("@mozilla.org/binaryoutputstream;1", "nsIBinaryOutputStream", "setOutputStream");
var BinaryInputStream = CC("@mozilla.org/binaryinputstream;1", "nsIBinaryInputStream", "setInputStream");
var SeekableStream = Ci.nsISeekableStream;

var BINARY = require("./binary-engine");
var ByteString = require("./binary").ByteString;

var IO = exports.IO = function(inputStream, outputStream) {
    this.inputStream = inputStream;
    this.outputStream = outputStream;
};
IO.prototype = {
    _binaryInputStream: null,
    _binaryOutputStream: null,
    get binaryInputStream() {
        return this._binaryInputStream || (this._binaryInputStream = new BinaryInputStream(this.inputStream));
    },
    get binaryOutputStream() {
        return this._binaryOutputStream || (this._binaryOutputStream = new BinaryOutputStream(this.outputStream));
    },
    read: function(length) {
        var stream = this.binaryInputStream;
        var readAll = (arguments.length == 0);
        if (typeof length !== "number") length = 1024;
        var bytes = stream.readByteArray(readAll ? stream.available() : length);
        return new ByteString(bytes, 0, bytes.length);
    },
    copy: function(output, mode, options) {
        var stream = this.binaryInputStream;
        var length = stream.available();
        var bytes = stream.readByteArray(length);
        output.binaryOutputStream.writeByteArray(bytes, length);
        output.flush();
        return this;
    },
    write: function(object, charset) {
        if (object === null || object === undefined || typeof object.toByteString !== "function")
            throw new Error("Argument to IO.write must have toByteString() method");
        var binary = object.toByteString(charset);
        var offset = binary._offset;
        var bytes = binary._bytes;
        var length = (this.length = binary.length);
        this.binaryOutputStream.writeByteArray(bytes.slice(offset, offset + bytes.length), length);
        return this;
    },
    flush: function() {
        this.binaryOutputStream.flush();
        return this;
    },
    close: function() {
        if (this._binaryInputStream) this._binaryInputStream.close();
        if (this.inputStream) this.inputStream.close();
        if (this._binarOutputStream) this._binaryOutputStream.close();
        if (this.outputStream) this.outputStream.close();
    },
    isatty: function() {
        return false;
    },
    _seekable: false,
    _ensureSeekable: function() {
        if (this._seekable) return;
        if (this.inputStream) this.inputStream.QueryInterface(SeekableStream);
        if (this.outputStream) this.outputStream.QueryInterface(SeekableStream);
        this._seekable = true;
    },
    seek: function(opaqueCookie) {
        this._ensureSeekable();
        if (this.inputStream) {
            var offset = opaqueCookie.inputStream === undefined ? opaqueCookie : opaqueCookie.inputStream;
            var whence = offset < 0 ? SeekableStream.NS_SEEK_END : SeekableStream.NS_SEEK_SET;
            this.inputStream.seek(whence, offset);
        }
        if (this.outputStream) {
            var offset = opaqueCookie.outputStream === undefined ? opaqueCookie : opaqueCookie.outputStream;
            var whence = offset < 0 ? SeekableStream.NS_SEEK_END : SeekableStream.NS_SEEK_SET;
            this.outputStream.seek(whence, offset);
        }
        return this;
    },
    tell: function() {
        this._ensureSeekable();
        return {
            inputStream: this.inputStream ? this.inputStream.tell() : null,
            outputStream: this.outputStream ? this.outputStream.tell() : null
        };
    }
};});
require.register("./binary-engine", function(exports) {
exports.B_LENGTH = function(bytes) {
    return bytes.length;
}

exports.B_ALLOC = function(length) {
    var bytes = new Array(length);
    for (var i = 0; i < length; i++)
        bytes[i] = 0;
    return bytes;
}

exports.B_FILL = function(bytes, from, to, value) {
    for (var i = from; i < to; i++)
        bytes[i] = value;
}

exports.B_COPY = function(src, srcOffset, dst, dstOffset, length) {
    for (var i = 0; i < length; i++)
        dst[dstOffset+i] = src[srcOffset+i];
}

exports.B_GET = function(bytes, index) {
    var b = bytes[index];
    return (b >= 0) ? b : -1 * ((b ^ 0xFF) + 1);
}

exports.B_SET = function(bytes, index, value) {
    return bytes[index] = (value < 128) ? value : -1 * ((value ^ 0xFF) + 1);
}

exports.B_DECODE = function(bytes, offset, length, codec) {
    var Converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
        createInstance(Ci.nsIScriptableUnicodeConverter);
    Converter.charset = codec;
    return Converter.convertFromByteArray(bytes.slice(offset, offset + length), length)
}

exports.B_DECODE_DEFAULT = function(bytes, offset, length) {
    return exports.B_DECODE(bytes, offset, length, "UTF-8");
}

exports.B_ENCODE = function(string, codec) {
    var Converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"].
        createInstance(Ci.nsIScriptableUnicodeConverter);
    Converter.charset = codec;
    return Converter.convertToByteArray(string, {});
}

exports.B_ENCODE_DEFAULT = function(string) {
    return exports.B_ENCODE(string, "UTF-8");
}

exports.B_TRANSCODE = function(bytes, offset, length, sourceCodec, targetCodec) {
    return exports.B_ENCODE(exports.B_DECODE(bytes, offset, length, sourceCodec), targetCodec);
}})
require.register("binary-engine", require.factories["./binary-engine"]);
/* binary */require.register("./binary", function(exports) {
var engine = require("./binary-engine"),
B_ALLOC = engine.B_ALLOC,
B_LENGTH = engine.B_LENGTH,
B_GET = engine.B_GET,
B_SET = engine.B_SET,
B_FILL = engine.B_FILL,
B_COPY = engine.B_COPY,
B_DECODE = engine.B_DECODE,
B_ENCODE = engine.B_ENCODE,
B_DECODE_DEFAULT = engine.B_DECODE_DEFAULT,
B_ENCODE_DEFAULT = engine.B_ENCODE_DEFAULT,
B_TRANSCODE = engine.B_TRANSCODE;

var Binary = exports.Binary = function() {
    // this._bytes
    // this._offset
    // this._length
};

// XXX non interoperable: create and use an Object.defineProperty stub.
Binary.prototype.__defineGetter__("length", function() {
    return this._length;
});
Binary.prototype.__defineSetter__("length", function(length) {
    print("x trying to set length: " + length);
});

// toArray() - n array of the byte values
// toArray(charset) - an array of the code points, decoded
Binary.prototype.toArray = function(charset) {
    if (arguments.length === 0) {
        var array = new Array(this._length);

        for (var i = 0; i < this._length; i++)
            array[i] = this.get(i);

        return array;
    }
    else if (arguments.length === 1) {
        var string = B_DECODE(this._bytes, this._offset, this._length, charset),
            length = string.length,
            array = new Array(length);

        for (var i = 0; i < length; i++)
            array[i] = string.charCodeAt(i);

        return array;
    }
    else
        throw new Error("Illegal arguments to toArray()");
};

// toByteArray() - just a copy
// toByteArray(sourceCharset, targetCharset) - transcoded
Binary.prototype.toByteArray = function(sourceCodec, targetCodec) {
    if (arguments.length < 2)
        return new ByteArray(this);
    else if (arguments.length === 2 && typeof sourceCodec === "string" && typeof targetCodec === "string") {
        var bytes = B_TRANSCODE(this._bytes, this._offset, this._length, sourceCodec, targetCodec);
        return new ByteArray(bytes, 0, B_LENGTH(bytes));
    }

    throw new Error("Illegal arguments to ByteArray toByteArray");
};

// toByteString() - byte for byte copy
// toByteString(sourceCharset, targetCharset) - transcoded
Binary.prototype.toByteString = function(sourceCodec, targetCodec) {
    if (arguments.length < 2)
        return new ByteString(this);
    else if (arguments.length === 2 && typeof sourceCodec === "string" && typeof targetCodec === "string") {
        var bytes = B_TRANSCODE(this._bytes, this._offset, this._length, sourceCodec, targetCodec);
        return new ByteString(bytes, 0, B_LENGTH(bytes));
    }

    throw new Error("Illegal arguments to ByteArray toByteString");
};

// decodeToString()
// decodeToString(charset) - returns a String from its decoded bytes in a given charset. If no charset is provided, or if the charset is "undefined", assumes the default system encoding.
// decodeToString(number) - returns a String from its decoded bytes in a given base, like 64, 32, 16, 8, 2
Binary.prototype.decodeToString = function(charset) {
    if (charset) {
        if (typeof charset == "number")
            return require("base" + charset).encode(this);
        else if (/^base/.test(charset))
            return require(charset).encode(this);
        else
            return B_DECODE(this._bytes, this._offset, this._length, charset);
    }
    return B_DECODE_DEFAULT(this._bytes, this._offset, this._length);
};

// get(offset) - Return the byte at offset as a Number.
Binary.prototype.get = function(offset) {
    if (offset < 0 || offset >= this._length)
        return NaN;

    //var b = this._bytes[this._offset + offset];
    //return (b >= 0) ? b : -1 * ((b ^ 0xFF) + 1);
    return B_GET(this._bytes, this._offset + offset)
};

Binary.prototype.indexOf = function(byteValue, start, stop) {
    // HACK: use ByteString's slice since we know we won't be modifying result
    var array = ByteString.prototype.slice.apply(this, [start, stop]).toArray(),
        result = array.indexOf(byteValue);
    return (result < 0) ? -1 : result + (start || 0);
};

Binary.prototype.lastIndexOf = function(byteValue, start, stop) {
    // HACK: use ByteString's slice since we know we won't be modifying result
    var array = ByteString.prototype.slice.apply(this, [start, stop]).toArray(),
        result = array.lastIndexOf(byteValue);
    return (result < 0) ? -1 : result + (start || 0);
};

// valueOf()
Binary.prototype.valueOf = function() {
    return this;
};

/* ByteString */

var ByteString = exports.ByteString = function() {
    if (!(this instanceof ByteString)) {
        if (arguments.length == 0)
            return new ByteString();
        if (arguments.length == 1)
            return new ByteString(arguments[0]);
        if (arguments.length == 2)
            return new ByteString(arguments[0], arguments[1]);
        if (arguments.length == 3)
            return new ByteString(arguments[0], arguments[1], arguments[2]);
    }

    // ByteString() - Construct an empty byte string.
    if (arguments.length === 0) {
        this._bytes     = B_ALLOC(0); // null;
        this._offset    = 0;
        this._length    = 0;
    }
    // ByteString(byteString) - Copies byteString.
    else if (arguments.length === 1 && arguments[0] instanceof ByteString) {
        return arguments[0];
    }
    // ByteString(byteArray) - Use the contents of byteArray.
    else if (arguments.length === 1 && arguments[0] instanceof ByteArray) {
        var copy = arguments[0].toByteArray();
        this._bytes     = copy._bytes;
        this._offset    = copy._offset;
        this._length    = copy._length;
    }
    // ByteString(arrayOfNumbers) - Use the numbers in arrayOfNumbers as the bytes.
    else if (arguments.length === 1 && Array.isArray(arguments[0])) {
        var array = arguments[0];
        this._bytes = B_ALLOC(array.length);
        for (var i = 0; i < array.length; i++) {
            var b = array[i];
            // If any element is outside the range 0...255, an exception (TODO) is thrown.
            if (b < -0x80 || b > 0xFF)
                throw new Error("ByteString constructor argument Array of integers must be -128 - 255 ("+b+")");
            // Java "bytes" are interpreted as 2's complement
            //this._bytes[i] = (b < 128) ? b : -1 * ((b ^ 0xFF) + 1);
            B_SET(this._bytes, i, b);
        }
        this._offset = 0;
        this._length = B_LENGTH(this._bytes);
    }
    // ByteString(string, charset) - Convert a string. The ByteString will contain string encoded with charset.
    else if ((arguments.length === 1 || (arguments.length === 2 && arguments[1] === undefined)) && typeof arguments[0] === "string") {
        this._bytes     = B_ENCODE_DEFAULT(arguments[0]);
        this._offset    = 0;
        this._length    = B_LENGTH(this._bytes);
    }
    else if (arguments.length === 2 && typeof arguments[0] === "string" && typeof arguments[1] === "string") {
        this._bytes     = B_ENCODE(arguments[0], arguments[1]);
        this._offset    = 0;
        this._length    = B_LENGTH(this._bytes);
    }
    // private: ByteString(bytes, offset, length)
    else if (arguments.length === 3 && typeof arguments[1] === "number" && typeof arguments[2] === "number") {
        this._bytes     = arguments[0];
        this._offset    = arguments[1];
        this._length    = arguments[2];
    }
    else {
        var util = require("util");
        throw new Error("Illegal arguments to ByteString constructor: " + util.repr(arguments));
    }

    if (engine.ByteStringWrapper)
        return engine.ByteStringWrapper(this);
    else
        return this;
};

ByteString.prototype = new Binary();

ByteString.prototype.__defineGetter__("length", function() {
    return this._length;
});
ByteString.prototype.__defineSetter__("length", function(length) {
});

// toByteArray() - Returns a byte for byte copy in a ByteArray.
// toByteArray(sourceCharset, targetCharset) - Returns a transcoded copy in a ByteArray.
//  - implemented on Binary

// toByteString() - Returns itself, since there's no need to copy an immutable ByteString.
// toByteString(sourceCharset, targetCharset) - Returns a transcoded copy.
//  - implemented on Binary

// toArray() - Returns an array containing the bytes as numbers.
// toArray(charset) - Returns an array containing the decoded Unicode code points.
//  - implemented on Binary

// toString()
ByteString.prototype.toString = function(charset) {
    if (charset)
        return this.decodeToString(charset);

    return "[ByteString "+this._length+"]";
};

// decodeToString(charset) - Returns the decoded ByteArray as a string.
//  - implemented on Binary

ByteString.prototype.byteAt =
ByteString.prototype.charAt = function(offset) {
    var byteValue = this.get(offset);

    if (isNaN(byteValue))
        return new ByteString();

    return new ByteString([byteValue]);
};

// indexOf() - implemented on Binary
// lastIndexOf() - implemented on Binary

// charCodeAt(offset)
ByteString.prototype.charCodeAt = Binary.prototype.get;

// get(offset) - implemented on Binary

// byteAt(offset) ByteString - implemented on Binary
// charAt(offset) ByteString - implemented on Binary

// split(delimiter, [options])
ByteString.prototype.split = function(delimiters, options) {
    var options = options || {},
        count = options.count === undefined ? -1 : options.count,
        includeDelimiter = options.includeDelimiter || false;

    // standardize delimiters into an array of ByteStrings:
    if (!Array.isArray(delimiters))
        delimiters = [delimiters];

    delimiters = delimiters.map(function(delimiter) {
        if (typeof delimiter === "number")
            delimiter = [delimiter];
        return new ByteString(delimiter);
    });

    var components = [],
        startOffset = this._offset,
        currentOffset = this._offset;

    // loop until there's no more bytes to consume
    bytes_loop :
    while (currentOffset < this._offset + this._length) {

        // try each delimiter until we find a match
        delimiters_loop :
        for (var i = 0; i < delimiters.length; i++) {
            var d = delimiters[i];

            for (var j = 0; j < d._length; j++) {
                // reached the end of the bytes, OR bytes not equal
                if (currentOffset + j > this._offset + this._length ||
                    B_GET(this._bytes, currentOffset + j) !== B_GET(d._bytes, d._offset + j)) {
                    continue delimiters_loop;
                }
            }

            // push the part before the delimiter
            components.push(new ByteString(this._bytes, startOffset, currentOffset - startOffset));

            // optionally push the delimiter
            if (includeDelimiter)
                components.push(new ByteString(this._bytes, currentOffset, d._length))

            // reset the offsets
            startOffset = currentOffset = currentOffset + d._length;

            continue bytes_loop;
        }

        // if there was no match, increment currentOffset to try the next one
        currentOffset++;
    }

    // push the remaining part, if any
    if (currentOffset > startOffset)
        components.push(new ByteString(this._bytes, startOffset, currentOffset - startOffset));

    return components;
};

// slice()
// slice(begin)
// slice(begin, end)
ByteString.prototype.slice = function(begin, end) {
    if (begin === undefined)
        begin = 0;
    else if (begin < 0)
        begin = this._length + begin;

    if (end === undefined)
        end = this._length;
    else if (end < 0)
        end = this._length + end;

    begin = Math.min(this._length, Math.max(0, begin));
    end = Math.min(this._length, Math.max(0, end));

    return new ByteString(this._bytes, this._offset + begin, end - begin);
};

// substr(start)
// substr(start, length)
ByteString.prototype.substr = function(start, length) {
    if (start !== undefined) {
        if (length !== undefined)
            return this.slice(start);
        else
            return this.slice(start, start + length);
    }
    return this.slice();
};

// substring(first)
// substring(first, last)
ByteString.prototype.substring = function(from, to) {
    if (from !== undefined) {
        if (to !== undefined)
            return this.slice(Math.max(Math.min(from, this._length), 0));
        else
            return this.slice(Math.max(Math.min(from, this._length), 0),
                              Math.max(Math.min(to, this._length), 0));
    }
    return this.slice();
};

// [] ByteString - TODO

// toSource()
ByteString.prototype.toSource = function() {
    return "ByteString(["+this.toArray().join(",")+"])";
};

/* ByteArray */

// ByteArray() - New, empty ByteArray.
// ByteArray(length) - New ByteArray filled with length zero bytes.
// ByteArray(byteArray) - Copy byteArray.
// ByteArray(byteString) - Copy contents of byteString.
// ByteArray(arrayOfBytes) - Use numbers in arrayOfBytes as contents.
//     Throws an exception if any element is outside the range 0...255 (TODO).
// ByteArray(string, charset) - Create a ByteArray from a Javascript string, the result being encoded with charset.
var ByteArray = exports.ByteArray = function() {
    if (!this instanceof ByteArray) {
        if (arguments.length == 0)
            return new ByteArray();
        if (arguments.length == 1)
            return new ByteArray(arguments[0]);
        if (arguments.length == 2)
            return new ByteArray(arguments[0], arguments[1]);
        if (arguments.length == 3)
            return new ByteArray(arguments[0], arguments[1], arguments[2]);
    }

    // ByteArray() - New, empty ByteArray.
    if (arguments.length === 0) {
        this._bytes     = B_ALLOC(0); // null;
        this._offset    = 0;
        this._length    = 0;
    }
    // ByteArray(length) - New ByteArray filled with length zero bytes.
    else if (arguments.length === 1 && typeof arguments[0] === "number") {
        this._bytes     = B_ALLOC(arguments[0]); // null;
        this._offset    = 0;
        this._length    = B_LENGTH(this._bytes);
    }
    // ByteArray(byteArray) - Copy byteArray.
    // ByteArray(byteString) - Copy contents of byteString.
    else if (arguments.length === 1 && (arguments[0] instanceof ByteArray || arguments[0] instanceof ByteString)) {
        var byteArray = new ByteArray(arguments[0]._length);
        B_COPY(arguments[0]._bytes, arguments[0]._offset, byteArray._bytes, byteArray._offset, byteArray._length);
        return byteArray;
    }
    // ByteArray(arrayOfBytes) - Use numbers in arrayOfBytes as contents.
    // Throws an exception if any element is outside the range 0...255 (TODO).
    else if (arguments.length === 1 && Array.isArray(arguments[0])) {
        var array = arguments[0];
        this._bytes = B_ALLOC(array.length);
        for (var i = 0; i < array.length; i++) {
            var b = array[i];
            // If any element is outside the range 0...255, an exception (TODO) is thrown.
            if (b < 0 || b > 0xFF)
                throw new Error("ByteString constructor argument Array of integers must be 0 - 255 ("+b+")");
            // Java "bytes" are interpreted as 2's complement
            //this._bytes[i] = (b < 128) ? b : -1 * ((b ^ 0xFF) + 1);
            B_SET(this._bytes, i, b);
        }
        this._offset = 0;
        this._length = B_LENGTH(this._bytes);
    }
    // ByteArray(string, charset) - Create a ByteArray from a Javascript string, the result being encoded with charset.
    else if ((arguments.length === 1 || (arguments.length === 2 && arguments[1] === undefined)) && typeof arguments[0] === "string") {
        this._bytes     = B_ENCODE_DEFAULT(arguments[0]);
        this._offset    = 0;
        this._length    = B_LENGTH(this._bytes);
    }
    else if (arguments.length === 2 && typeof arguments[0] === "string" && typeof arguments[1] === "string") {
        this._bytes     = B_ENCODE(arguments[0], arguments[1]);
        this._offset    = 0;
        this._length    = B_LENGTH(this._bytes);
    }
    // private: ByteArray(bytes, offset, length)
    else if (arguments.length === 3 && typeof arguments[1] === "number" && typeof arguments[2] === "number") {
        this._bytes     = arguments[0];
        this._offset    = arguments[1];
        this._length    = arguments[2];
    }
    else
        throw new Error("Illegal arguments to ByteString constructor: [" +
            Array.prototype.join.apply(arguments, [","]) + "] ("+arguments.length+")");

    if (engine.ByteArrayWrapper)
        return engine.ByteArrayWrapper(this);
    else
        return this;
};

ByteArray.prototype = new Binary();

ByteArray.prototype.__defineGetter__("length", function() {
    return this._length;
});
ByteArray.prototype.__defineSetter__("length", function(length) {
    if (typeof length !== "number")
        return;

    // same length
    if (length === this._length) {
        return;
    }
    // new length is less, truncate
    else if (length < this._length) {
        this._length = length;
    }
    // new length is more, but fits without moving, just clear new bytes
    else if (this._offset + length <= B_LENGTH(this._bytes)) {
        B_FILL(this._bytes, this._length, this._offset + length - 1, 0);
        this._length = length;
    }
    // new length is more, but fits if we shift to bottom, so do that.
    else if (length <= B_LENGTH(this._bytes)) {
        B_COPY(this._bytes, this._offset, this._bytes, 0, this._length);
        this._offset = 0;
        B_FILL(this._bytes, this._length, this._offset + length - 1, 0);
        this._length = length;
    }
    // new length is more than the allocated bytes array, allocate a new one and copy the data
    else {
        var newBytes = B_ALLOC(length);
        B_COPY(this._bytes, this._offset, newBytes, 0, this._length);
        this._bytes = newBytes;
        this._offset = 0;
        this._length = length;
    }
});

// FIXME: array notation for set and get
ByteArray.prototype.set = function(index, b) {
    // If any element is outside the range 0...255, an exception (TODO) is thrown.
    if (b < 0 || b > 0xFF)
        throw new Error("ByteString constructor argument Array of integers must be 0 - 255 ("+b+")");

    if (index < 0 || index >= this._length)
        throw new Error("Out of range");

    // Java "bytes" are interpreted as 2's complement
    //this._bytes[this._offset + index] = (b < 128) ? b : -1 * ((b ^ 0xFF) + 1);
    B_SET(this._bytes, this._offset + index, b);
};

// toArray()
// toArray(charset)
//  - implemented on Binary

// toByteArray() - just a copy
// toByteArray(sourceCharset, targetCharset) - transcoded
//  - implemented on Binary

// toByteString() - byte for byte copy
// toByteString(sourceCharset, targetCharset) - transcoded
//  - implemented on Binary

// toString() - a string representation like "[ByteArray 10]"
// toString(charset) - an alias for decodeToString(charset)
ByteArray.prototype.toString = function(charset) {
    if (charset)
        return this.decodeToString(charset);

    return "[ByteArray "+this._length+"]";
};

// decodeToString(charset) - implemented on Binary

// byteAt(offset) ByteString - Return the byte at offset as a ByteString.
//  - implemented on Binary

// get(offset) Number - Return the byte at offset as a Number.
//  - implemented on Binary

// concat(other ByteArray|ByteString|Array)
// TODO: I'm assuming Array means an array of ByteStrings/ByteArrays, not an array of integers.
ByteArray.prototype.concat = function() {
    var components = [this],
        totalLength = this._length;

    for (var i = 0; i < arguments.length; i++) {
        var component = Array.isArray(arguments[i]) ? arguments[i] : [arguments[i]];

        for (var j = 0; j < component.length; j++) {
            var subcomponent = component[j];
            if (!(subcomponent instanceof ByteString) && !(subcomponent instanceof ByteArray))
                throw "Arguments to ByteArray.concat() must be ByteStrings, ByteArrays, or Arrays of those.";

            components.push(subcomponent);
            totalLength += subcomponent.length;
        }
    }

    var result = new ByteArray(totalLength),
        offset = 0;

    components.forEach(function(component) {
        B_COPY(component._bytes, component._offset, result._bytes, offset, component._length);
        offset += component._length;
    });

    return result;
};

// pop() -> byte Number
ByteArray.prototype.pop = function() {
    if (this._length === 0)
        return undefined;

    this._length--;

    return B_GET(this._bytes, this._offset + this._length);
};

// push(...variadic Numbers...)-> count Number
ByteArray.prototype.push = function() {
    var length, newLength = this.length += length = arguments.length;
    try {
        for (var i = 0; i < length; i++)
            this.set(newLength - length + i, arguments[i]);
    } catch (e) {
        this.length -= length;
        throw e;
    }
    return newLength;
};

// extendRight(...variadic Numbers / Arrays / ByteArrays / ByteStrings ...)
ByteArray.prototype.extendRight = function() {
    throw "NYI";
};

// shift() -> byte Number
ByteArray.prototype.shift = function() {
    if (this._length === 0)
        return undefined;

    this._length--;
    this._offset++;

    return B_GET(this._bytes, this._offset - 1);
};

// unshift(...variadic Numbers...) -> count Number
ByteArray.prototype.unshift = function() {
    var copy = this.slice();
    this.length = 0;
    try {
        this.push.apply(this, arguments);
        this.push.apply(this, copy.toArray());
        return this.length;
    } catch(e) {
        B_COPY(copy._bytes, copy._offset, this._bytes, this._offset, copy.length);
        this.length = copy.length;
        throw e;
    }
};

// extendLeft(...variadic Numbers / Arrays / ByteArrays / ByteStrings ...)
ByteArray.prototype.extendLeft = function() {
    throw "NYI";
};

// reverse() in place reversal
ByteArray.prototype.reverse = function() {
    // "limit" is halfway, rounded down. "top" is the last index.
    var limit = Math.floor(this._length/2) + this._offset,
        top = this._length - 1;

    // swap each pair of bytes, up to the halfway point
    for (var i = this._offset; i < limit; i++) {
        var tmp = B_GET(this._bytes, i);
        B_SET(this._bytes, i, B_GET(this._bytes, top - i));
        B_SET(this._bytes, top - i, tmp);
    }

    return this;
};

// slice()
ByteArray.prototype.slice = function() {
    return new ByteArray(ByteString.prototype.slice.apply(this, arguments));
};

var numericCompareFunction = function(o1, o2) { return o1 - o2; };

// sort([compareFunction])
ByteArray.prototype.sort = function(compareFunction) {
    // FIXME: inefficient?

    var array = this.toArray();

    if (arguments.length)
        array.sort(compareFunction);
    else
        array.sort(numericCompareFunction);

    for (var i = 0; i < array.length; i++)
        this.set(i, array[i]);
};

// splice()
ByteArray.prototype.splice = function(index, howMany /*, elem1, elem2 */) {
    if (index === undefined) return;
    if (index < 0) index += this.length;
    if (howMany === undefined) howMany = this._length - index;
    var end = index + howMany;
    var remove = this.slice(index, end);
    var keep = this.slice(end);
    var inject = Array.prototype.slice.call(arguments, 2);
    this._length = index;
    this.push.apply(this, inject);
    this.push.apply(this, keep.toArray());
    return remove;
};

// indexOf() - implemented on Binary
// lastIndexOf() - implemented on Binary

// split() Returns an array of ByteArrays instead of ByteStrings.
ByteArray.prototype.split = function() {
    var components = ByteString.prototype.split.apply(this.toByteString(), arguments);

    // convert ByteStrings to ByteArrays
    for (var i = 0; i < components.length; i++) {
        // we know we can use these byte buffers directly since we copied them above
        components[i] = new ByteArray(components[i]._bytes, components[i]._offset, components[i]._length);
    }

    return components;
};

// filter(callback[, thisObject])
ByteArray.prototype.filter = function(callback, thisObject) {
    var result = new ByteArray(this._length);
    for (var i = 0, length = this._length; i < length; i++) {
        var value = this.get(i);
        if (callback.apply(thisObject, [value, i, this]))
            result.push(value);
    }
    return result;
};

// forEach(callback[, thisObject]);
ByteArray.prototype.forEach = function(callback, thisObject) {
    for (var i = 0, length = this._length; i < length; i++)
        callback.apply(thisObject, [this.get(i), i, this]);
};

// every(callback[, thisObject])
ByteArray.prototype.every = function(callback, thisObject) {
    for (var i = 0, length = this._length; i < length; i++)
        if (!callback.apply(thisObject, [this.get(i), i, this]))
            return false;
    return true;
};

// some(callback[, thisObject])
ByteArray.prototype.some = function(callback, thisObject) {
    for (var i = 0, length = this._length; i < length; i++)
        if (callback.apply(thisObject, [this.get(i), i, this]))
            return true;
    return false;
};

// map(callback[, thisObject]);
ByteArray.prototype.map = function(callback, thisObject) {
    var result = new ByteArray(this._length);
    for (var i = 0, length = this._length; i < length; i++)
        result.set(i, callback.apply(thisObject, [this.get(i), i, this]));
    return result;
};

// reduce(callback[, initialValue])
ByteArray.prototype.reduce = function(callback, initialValue) {
    var value = initialValue;
    for (var i = 0, length = this._length; i < length; i++)
        value = callback(value, this.get(i), i, this);
    return value;
};

// reduceRight(callback[, initialValue])
ByteArray.prototype.reduceRight = function(callback, initialValue) {
    var value = initialValue;
    for (var i = this._length-1; i > 0; i--)
        value = callback(value, this.get(i), i, this);
    return value;
};

// displace(begin, end, values/ByteStrings/ByteArrays/Arrays...) -> length
//     begin/end are specified like for slice. Can be used like splice but does not return the removed elements.
ByteArray.prototype.displace = function(begin, end) {
    throw "NYI";
};

// toSource() returns a string like "ByteArray([])" for a null byte-array.
ByteArray.prototype.toSource = function() {
    return "ByteArray(["+this.toArray().join(",")+"])";
};});
/* binary */require.register("binary", require.factories["./binary"]);
/* global-commonjs */require.register("global-commonjs", function(exports) {
// https://wiki.mozilla.org/ServerJS/Binary/B
if (!String.prototype.toByteString)
    String.prototype.toByteString = function(charset) {
        // RHINO bug: it thinks "this" is a Java string (?!)
        var binary = require("binary");
        return new binary.ByteString(String(this), charset);
    };

// https://wiki.mozilla.org/ServerJS/Binary/B
if (!String.prototype.toByteArray)
    String.prototype.toByteArray = function(charset) {
        // RHINO bug: it thinks "this" is a Java string (?!)
        var binary = require("binary");
        return new binary.ByteArray(String(this), charset);
    };

// https://wiki.mozilla.org/ServerJS/Binary/B
if (!String.prototype.charCodes)
    String.prototype.charCodes = function() {
        return Array.prototype.map.call(this, function (c) {
            return c.charCodeAt();
        });
    };

// https://wiki.mozilla.org/ServerJS/Binary/B
if (!String.prototype.fromCharCodes)
    String.fromCharCodes = function (codes) {
        return codes.map(String.fromCharCode).join('');
    };

// https://wiki.mozilla.org/ServerJS/Binary/B
if (!Array.prototype.toByteString)
    Array.prototype.toByteString = function(charset) {
        return new require("binary").ByteString(this);
    };

if (!Array.prototype.toByteArray)
    Array.prototype.toByteArray = function(charset) {
        return new ByteArray(this);
    };
});
/* shell */require.register("shell", function(exports) {
['Narwhal shell module']
var Sandbox = require("sandbox-engine").Sandbox;
var EMPTY_MATCH = /^\s*$/;
var STATEMENT_MATCH = /^\s*;\s*$/;
var buffer = "";
var NORMAL_PS = "js> ";
var UNFINISHED_PS = "   > ";

exports.shell = function shell(socket) {
    ['Shell service']
    // Stroing WebSocketHandler's onmessage method to redirect on non flash policy requests
    var buffer = "";
    var ps = NORMAL_PS;
    var sandbox = Sandbox(global);
    var print = sandbox.print = function print(text) {
        socket.write(text + "\n");
    }
    function repl() {
        socket.write(Array.prototype.slice.call(arguments).join("\n" + ps) + "\n");
    }
    function prompt() {
        socket.write(ps);
    }
    function handleError(e) {
        var result = "";
        var realException = e.cause || e;
        if (realException) {
            result += "Details:\n";
            for (var key in realException) {
                var content = String(realException[key]);
                if (content.indexOf('\n') != -1) content = '\n' + content.replace(/^(?!$)/gm, '    ');
                else content = ' ' + content;
                result += '  ' + key + ':' + content.replace(/\s*\n$/m, '');
            }
            result += "\n"
        }
        return result;
    }
    function represent(thing) {
        var result;
        switch(typeof(thing)) {
            case "string":
                result = '"' + thing + '"';
                break;
            case "number":
                result = thing;
                break;
            case "object":
                var names = [];
                for(var name in thing) names.push(name);
                result = thing;
                if (names.length > 0) {
                    result += " - {";
                    result += names.slice(0, 7).map(function(n) {
                        var repr = n + ": ";
                        try {
                            repr += (typeof(thing[n]) == "object" ? "{...}" : represent(thing[n]));
                        } catch(e) {
                            repr += "[Exception!]";
                        }
                        return repr;
                    }).join(", ");
                    if (names.length > 7) result += ", ...";
                    result += "}";
                }
                break;
            case "function":
                var source = thing.toString();
                result = source.substr(0, source.indexOf("\n")) + "...}";
                break;
            default:
                result = thing;
        }
        return result;
    }
    socket.onopen = function() {
       print("Narwhal Shell 0.1");
       prompt();
    };
    socket.onmessage = function() {
        var chunk = this.read().decodeToString();
        if (EMPTY_MATCH.test(chunk)) return prompt();
        var isStatement = STATEMENT_MATCH.test(chunk);
        buffer += chunk;
        try {
            var result = sandbox._ = sandbox.evaluate(buffer);
            if (undefined !== result) repl(represent(result));
            buffer = "";
            ps = NORMAL_PS;
        } catch(e) {
            sandbox.__ = e;
            if (e.name == "SyntaxError" && !isStatement) {
                ps = UNFINISHED_PS;
            } else {
                print(handleError(e));
                buffer = "";
                ps = NORMAL_PS;
            }
        }
        prompt();
    };
    socket.onclose = function() {}
};});
require.register("sandbox-engine", function(exports) {
var systemPrincipal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);
exports.Sandbox = function(options) {
    var context = Cu.Sandbox(systemPrincipal);
    if (options) context.__proto__ = options;
    context.evaluate = function(code, path) {
        return Cu.evalInSandbox(code, context, "1.8", path || "Anonymus", 0);
    }
    return context;
}});
require("global-commonjs");
var shell = require("shell").shell;
var server = new (require("socket").ServerSocket)();
server.onopen = function onopen() {
    shell(this);
    print("connected", this.onopen == onopen);
};
server.listen("4242");
print("listening...");
/*
// Setup the status bar component
jetpack.statusBar.append({
  html: <>
    <img src="http://mail.google.com/mail/images/favicon.ico"/>
      <span id="count" style="position:absolute;left:4px;top:8px;font-size:10px;cursor: pointer;background-color:rgba(255,255,255, .8);"></span>
  </>,
  onReady: function(doc) {
    var gmail = new GmailNotifier(doc);
  },
  width: 20
});


// Gmail Notifier
function GmailNotifier(doc){
  $(doc).click(this.goToInbox);
  this.update(doc);
  setInterval(function() {
    this.update(doc);
  }, 60 * 1000);
}
GmailNotifier.prototype = {
  goToInbox: function() {
    jetpack.tabs.open("http://mail.google.com");
    jetpack.tabs[ jetpack.tabs.length-1 ].focus();
  },

  update: function(doc) {
    var url = "http://mail.google.com/mail/feed/atom";
    doc = $(doc);
    $.get( url, function(xml){
      var el = $(xml).find("fullcount"); // Unread message count

      if (el) {
        var count = el.get(0).textContent;
        doc.find("#count").text( count );
      } else {
        doc.find("#count").text( "Login" );
      }
    });
  }
}
*/