'use strict';

//const vConsole = new VConsole();
//window.datgui = new dat.GUI();

const base_url = "";

var vue_options = {
    el: "#top",
    mixins: [mixins_bootstrap],
    data: {
        irremocon_list: [],
        switchbot_list: [],
        button_list: [],
        irremocon_create: {},
        irremocon_update: { action: {} },
        irremocon_create_id: null,
    },
    computed: {
    },
    methods: {
        irremocon_delete: async function(index){
            if( !confirm('本当に削除しますか？') )
                return;
            var result = await do_post(base_url + "/irremocon-delete", { id: this.irremocon_list[index].id });
            this.irremocon_list_update();
            alert('削除しました。');
        },
        irremocon_edit_ir: async function(index){
            this.progress_open();
            try{
                var result_register = await do_post(base_url + "/irremocon-start-register", { id: this.irremocon_list[index].id });
                while(true){
                    var result = await do_post(base_url + "/irremocon-list");
                    if( !result.registering ){
                        this.irremocon_list_update();
                        alert('変更しました。');
                        break;
                    }
                    if( result_register.end < new Date().getTime() )
                        throw "register timeout";

                    await wait_async(1000);
                }
            }catch(error){
                alert(error);
            }finally{
                this.progress_close();
            }
        },
        irremocon_create_call: async function(){
            this.dialog_close('#create_dialog');
            this.progress_open();
            try{
                var result_register = await do_post(base_url + "/irremocon-start-register", { id: this.irremocon_create_id });
                while(true){
                    var result = await do_post(base_url + "/irremocon-list");
                    if( !result.registering ){
                        this.irremocon_list_update();
                        alert('登録しました。');
                        break;
                    }
                    if( result_register.end < new Date().getTime() )
                        throw "register timeout";
                    await wait_async(1000);
                }
            }catch(error){
                alert(error);
            }finally{
                this.progress_close();
            }
        },
        irremocon_update_start: async function(index){
            this.irremocon_update = {
                id: this.irremocon_list[index].id,
                name: this.irremocon_list[index].name,
                action: this.irremocon_list[index].action ? JSON.parse(JSON.stringify(this.irremocon_list[index].action)) : {}
            };
            this.dialog_open('#edit_dialog');
        },
        irremocon_update_call: async function(){
            var action = {
                type: this.irremocon_update.action.type
            };
            if( this.irremocon_update.action.type == 'switchbot' ){
                action.commandType = this.irremocon_update.action.commandType;
                action.command = this.irremocon_update.action.command;
                action.deviceId = this.irremocon_update.action.deviceId;
            }else if( this.irremocon_update.action.type == 'http' ){
                action.methodType = this.irremocon_update.action.methodType;
                action.url = this.irremocon_update.action.url;
            }else if( this.irremocon_update.action.type == 'udp' ){
                action.host = this.irremocon_update.action.host;
                action.port = this.irremocon_update.action.port;
            }
            var params = {
                id: this.irremocon_update.id,
                name: this.irremocon_update.name,
                action: action
            };
            var result = await do_post(base_url + "/irremocon-update", params);
            this.irremocon_list_update();
            this.dialog_close('#edit_dialog');
        },
        irremocon_list_update: async function(){
            var result = await do_post(base_url + "/irremocon-list");
            console.log(result);
            var list = [];
            for( let item of result.button_list ){
                var t = result.list.find( i => i.id == item );
                if( !t )
                    list.push(item);
            }
            this.button_list = list;
            for( let item of result.list ){
                if( item.action && item.action.type == "switchbot"){
                    var t = this.switchbot_list.find(i => i.deviceId == item.action.deviceId);
                    if( t )
                        item.action.deviceName = t.deviceName;
                }
            }
            this.irremocon_list = result.list;
        },
    },
    created: function(){
    },
    mounted: async function(){
        proc_load();

        var result = await do_post(base_url + "/irremocon-switchbot-devicelist");
        console.log(result);
        this.switchbot_list = result.infraredRemoteList;
        this.irremocon_list_update();
    }
};
vue_add_data(vue_options, { progress_title: '' }); // for progress-dialog
vue_add_global_components(components_bootstrap);
vue_add_global_components(components_utils);

/* add additional components */
  
window.vue = new Vue( vue_options );

async function wait_async(msec){
    return new Promise(resolve => setTimeout(resolve, msec));
}