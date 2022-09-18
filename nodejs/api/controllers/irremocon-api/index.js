'use strict';

const HELPER_BASE = process.env.HELPER_BASE || "/opt/";
const Response = require(HELPER_BASE + 'response');
const Redirect = require(HELPER_BASE + 'redirect');

const SWITCHBOT_OPENTOKEN = "【SwitchBotのトークン】";
const SwitchBot = require('./switchbot');
const switchbot = new SwitchBot(SWITCHBOT_OPENTOKEN);
const jsonfile = require(HELPER_BASE + 'jsonfile-utils');

const { URL, URLSearchParams } = require('url');
const fetch = require('node-fetch');
const Headers = fetch.Headers;

const DATA_FILE = process.env.THIS_BASE_PATH + "/data/irremocon/data.json";
const crypto = require('crypto');
const REGISTER_DURATION = 20000;

var dgram = require("dgram")
var udp = dgram.createSocket("udp4")

let registering = null;

const button_list = [
	"電源", "入力切替", "放送", "画面", "タイマー",
	"1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
	"音量＋", "音量－", "選局＋", "選局－", "音声", "消音"
];

(async () =>{
	console.log(await switchbot.getDeviceList());
})();

exports.handler = async (event, context, callback) => {
	var body = JSON.parse(event.body);
	console.log(body);
	if( event.path == "/irremocon-switchbot-devicelist" ){
		var list = await switchbot.getDeviceList();
		return new Response(list);
	}else

	if( event.path == "/irremocon-list" ){
		var list = await jsonfile.read_json(DATA_FILE, []);
		return new Response({ button_list: button_list, list: list, registering: registering });
	}else

	if( event.path == "/irremocon-delete" ){
		var id = body.id;
		var list = await jsonfile.read_json(DATA_FILE, []);
		var index = list.findIndex(item => item.id == id);
		if( index < 0)
			throw new Error('not found');
		list.splice(index, 1);
		await jsonfile.write_json(DATA_FILE, list);
		return new Response({});
	}else

	if( event.path == "/irremocon-update" ){
		var list = await jsonfile.read_json(DATA_FILE, []);
		var item = list.find(item => item.id == body.id );
		if( !item )
			throw new Error('item not found');

		if( body.name !== undefined ) item.name = body.name;
		if( body.action !== undefined ) item.action = body.action;
		await jsonfile.write_json(DATA_FILE, list);

		return new Response({});
	}else

	if( event.path == "/irremocon-start-register" ){
		registering = {
			id: body.id,
			started_at: new Date().getTime()
		}
		return new Response({ start: registering.started_at, end: registering.started_at + REGISTER_DURATION });
	}else

	if( event.path == "/irremocon-register" ){
		if( !registering || (registering.started_at + REGISTER_DURATION) < new Date().getTime() )
			throw new Error('register time out');

		var list = await jsonfile.read_json(DATA_FILE, []);
		var item = list.find(item => item.id == registering.id );
		if( !item ){
			item = {
				id: registering.id,
				ir: body,
			};
			list.push(item);
			list.sort((first, second) =>{
				var firstIndex = button_list.findIndex(item => item == first.id );
				var secondIndex = button_list.findIndex(item => item == second.id );
				if (firstIndex < secondIndex){
					return -1;
				}else if (firstIndex > secondIndex){
					return 1;
				}else{
					return 0;
				}
			});
		}else{
			item.id = registering.id;
			item.ir = body
		}
		registering = null;
		await jsonfile.write_json(DATA_FILE, list);

		return new Response({ list: list });
	}else

	if( event.path == "/irremocon-receive" ){
		var list = await jsonfile.read_json(DATA_FILE, []);
		var item = list.find(item => item.ir.value == body.value );
		if( !item )
			throw new Error('item not found');
		if( !item.action )
			throw new Error('action not defined');

		var result = false;
		switch(item.action.type){
			case "switchbot": {
				console.log(item.action);
				switch(item.action.commandType){
					case 'command': {
						await switchbot.sendDeviceControlCommand(item.action.deviceId, 'command', item.action.command, 'default');
						result = true;
						break;
					}
					case 'customize': {
						await switchbot.sendDeviceControlCommand(item.action.deviceId, 'customize', item.action.command, 'default');
						result = true;
						break;
					}
				}
				break;
			}
			case "http": {
				switch(item.action.methodType){
					case 'post': {
						await do_post(item.action.url, { id: item.id });
						result = true;
						break;
					}
					case 'get': {
						await do_get(item.action.url, { id: item.id });
						result = true;
						break;
					}
				}
				break;
			}
			case "udp": {
				var payload = {
					id: item.id
				};
				udp.send(JSON.stringify(payload), item.action.port, item.action.host, (err, bytes) =>{
					if( err )
						console.error(error);
				});
				result = true;
				break;
			}
		}
		return new Response({ result: result });
	}
};

function do_post(url, body) {
  const headers = new Headers({ "Content-Type": "application/json" });

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

function do_get(url, qs) {
  var params = new URLSearchParams(qs);

  var params_str = params.toString();
  var postfix = (params_str == "") ? "" : ((url.indexOf('?') >= 0) ? ('&' + params_str) : ('?' + params_str));
  return fetch(url + postfix, {
      method: 'GET',
    })
    .then((response) => {
      if (!response.ok)
        throw new Error('status is not 200');
      return response.json();
    });
}