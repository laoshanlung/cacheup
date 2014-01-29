var Abstract = require('./abstract')
  , redis = require('redis')
  , arrg = require('arrg')
  , when = require('when')
  , _ = require('underscore');

var createClient = function() {
  var args = arrg(arguments, ['host', 'port', 'password'], {
    password: null
  });

  var client = redis.createClient(args.port, args.host, {
    auth_pass: args.password
  });

  return client;
};

var RedisAdapter = Abstract.extend({
  initialize: function() {
    var self = this;
    this._clients = {};

    // proxy error event to the EmitEmitter
    _.each(this.servers, function(server){
      var client = createClient(server);

      client.on('error', function(error){
        self.emit('error', error);
      });

      this._clients[server.host+':'+server.port] = client;
    }, this);
  },

  // based on the key to pick the correct redis client
  _pickRedisClient: function(key) {
    var serverKey = this.getRingValue(key);
    return this._clients[serverKey];
  },

  set: function(key, value, options) {
    var self = this;

    options = options || {};
    var deferred = this.defer();

    var client = this._pickRedisClient(key);

    var ttl = options.ttl || this.ttl;

    client.setex(key, ttl, this._filterData(value), function(error, result){
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(value);
      }
    });

    return deferred.promise;
  },

  get: function(key, options) {
    var self = this;

    options = options || {};
    var deferred = this.defer();

    var client = this._pickRedisClient(key);

    var extendttl = options.extendttl;

    if (typeof(extendttl) == 'undefined') {
      extendttl = this.extendttl;
    }

    var ttl = options.ttl || this.ttl;

    client.get(key, function(error, result){
      if (error) {
        deferred.reject(error);
      } else {
        if (extendttl) {
          // we don't really care about the result, don't we?
          client.expire(key, ttl); 
        }
        result = self._parseData(result);
        deferred.resolve(result);
      }
    });

    return deferred.promise;
  },

  del: function(key, value, options) {
    options = options || {};
    var deferred = this.defer();

    var client = this._pickRedisClient(key);

    var ttl = options.ttl || this.ttl;

    client.del(key, function(error, result){
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(key);
      }
    });

    return deferred.promise;
  },

  check: function(key) {
    var deferred = this.defer();

    var client = this._pickRedisClient(key);

    client.ttl(key, function(error, result){
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(result);
      }
    });

    return deferred.promise;
  },

  touch: function(key, options) {
    var self = this;
    options = options || {};
    var deferred = this.defer();

    var client = this._pickRedisClient(key);

    var ttl = options.ttl || this.ttl;

    client.expire(key, ttl, function(error, result){
      if (error) {
        deferred.reject(error);
      } else {
        deferred.resolve(ttl);
      }
    });

    return deferred.promise;
  },

  clear: function() {
    // we dont really need to return anything here, do we?
    _.each(this._clients, function(client){
      client.flushdb();
    });
  }
});

module.exports = RedisAdapter;