"use strict";

const base_url = "https://api.switch-bot.com/v1.0";

const { URLSearchParams } = require('url');
const fetch = require('node-fetch');
const Headers = fetch.Headers;

class SwitchBot{
    constructor(token){
      this.authorization = token;
    }

    async getDeviceList(){
      var json = await do_get_with_authorization(base_url + "/devices", null, this.authorization);
      if( json.statusCode != 100 )
        throw new Error("statusCode is not 100");
      return json.body;
    }

    async getDeviceStatus(deviceId){
      var json = await do_get_with_authorization(base_url + "/devices/" + deviceId + "/status", null, this.authorization);
      if( json.statusCode != 100 )
        throw new Error("statusCode is not 100");
      return json.body;
    }

    async sendDeviceControlCommand(deviceId, commandType, command, parameter ){
      var params = {
        command: command,
        parameter: parameter,
        commandType: commandType
      };
      var json = await do_post_with_authorization(base_url + "/devices/" + deviceId + "/commands", params, this.authorization);
      if( json.statusCode != 100 )
        throw new Error("statusCode is not 100");
    }
}

module.exports = SwitchBot;

function do_get_with_authorization(url, qs, authorization) {
  const headers = new Headers({ Authorization: authorization });
  var params = new URLSearchParams(qs);

  var params_str = params.toString();
  var postfix = (params_str == "") ? "" : ((url.indexOf('?') >= 0) ? ('&' + params_str) : ('?' + params_str));
  return fetch(url + postfix, {
      method: 'GET',
      headers: headers
    })
    .then((response) => {
      if (!response.ok)
        throw new Error('status is not 200');
      return response.json();
    });
}

function do_post_with_authorization(url, body, authorization) {
  const headers = new Headers({ "Content-Type": "application/json", Authorization: authorization });

  return fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: headers
    })
    .then((response) => {
      if (!response.ok)
        throw new Error('status is not 200');
      return response.json();
    });
}