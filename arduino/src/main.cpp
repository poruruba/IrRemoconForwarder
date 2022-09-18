#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

#include <IRrecv.h>
#include <IRremoteESP8266.h>
#include <IRutils.h>

#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>

#define HTTP_POST_URL_REGISTER  "http://【Node.jsサーバのホスト名】:20080/irremocon-register"
#define HTTP_POST_URL_RECEIVE  "http://【Node.jsサーバのホスト名】:20080/irremocon-receive"

#if defined(ARDUINO_M5Stick_C) 
#include <M5StickC.h>
#define IR_RECV_PORT 33
#define LED_PORT 10
#elif defined(ARDUINO_M5Stack_ATOM)
#include <M5Atom.h>
#define IR_RECV_PORT 32
#define NUM_OF_PIXELS 25
#define PIXELS_PORT 27
#elif defined(ARDUINO_ESP32C3_DEV) 
#define IR_RECV_PORT 0
#define NUM_OF_PIXELS 1
#define PIXELS_PORT 2
#define BUTTON_PORT 3
#endif

#define JSON_CAPACITY 512
static StaticJsonDocument<JSON_CAPACITY> jsonDoc;

static IRrecv irrecv(IR_RECV_PORT);
static decode_results results;

#if defined(NUM_OF_PIXELS)
static Adafruit_NeoPixel pixels = Adafruit_NeoPixel(NUM_OF_PIXELS, PIXELS_PORT, NEO_GRB + NEO_KHZ800);
#endif
#if defined(BUTTON_PORT)
#include "MyButton.h"
static MyButton Btn = MyButton(BUTTON_PORT, true, 10);
#endif

//#define WIFI_SSID "【固定のWiFiアクセスポイントのSSID】" // WiFiアクセスポイントのSSID
//#define WIFI_PASSWORD "【固定のWiFIアクセスポイントのパスワード】" // WiFIアクセスポイントのパスワード
#define WIFI_SSID NULL // WiFiアクセスポイントのSSID
#define WIFI_PASSWORD NULL // WiFIアクセスポイントのパスワード
#define WIFI_TIMEOUT  10000
#define SERIAL_TIMEOUT1  10000
#define SERIAL_TIMEOUT2  20000
static long wifi_try_connect(bool infinit_loop);

static long httpPostJson(const char *p_url, JsonDocument& jdoc);
static long process_ir_receive(void);

#define LED_CLEAR 0
#define LED_BLINK_1 1
#define LED_BLINK_2 2

#define RECEIVING_DURATIOIN 10000
static bool receiving = false;
static unsigned long start_receive = 0;

static void led_initialize(void)
{
#if defined(NUM_OF_PIXELS)
  pixels.begin();
  pixels.clear();
  pixels.show();
#elif defined(LED_PORT)
  pinMode(LED_PORT, OUTPUT);
#endif
}

static void led_change(uint8_t mode)
{
  switch(mode){
    case 0:{
#if defined(NUM_OF_PIXELS)
      pixels.clear();
      pixels.show();
#elif defined(LED_PORT)
      digitalWrite(LED_PORT, HIGH);
#endif
      break;
    }
    case 1: {
#if defined(NUM_OF_PIXELS)
      pixels.setPixelColor(0, 0x00ff00);
      pixels.show();
#elif defined(LED_PORT)
      digitalWrite(LED_PORT, LOW);
#endif
      break;
    }
    case 2: {
#if defined(NUM_OF_PIXELS)
      pixels.setPixelColor(0, 0x0000ff);
      pixels.show();
#elif defined(LED_PORT)
      digitalWrite(LED_PORT, HIGH);
#endif
      break;
    }
  }
}

void setup() {
  // put your setup code here, to run once:
#if defined(ARDUINO_M5Stick_C) 
  M5.begin(true, true, true);
#elif defined(ARDUINO_M5Stack_ATOM)
  M5.begin(true, true, false);
#else
  Serial.begin(115200);
#endif

  Serial.println("setup start");

  led_initialize();
  led_change(LED_CLEAR);

  wifi_try_connect(true);

  irrecv.enableIRIn();

  Serial.println("setup finished");
}

void loop() {
  // put your main code here, to run repeatedly:
#if defined(ARDUINO_ESP32C3_DEV) 
  Btn.read();
#else
  M5.update();
#endif

  if( receiving ){
    static unsigned long last_blink = 0;

    unsigned long now = millis();
    if( (now - start_receive) >= RECEIVING_DURATIOIN ){
      receiving = false;
      led_change(LED_CLEAR);
      Serial.println("end wait receiving");
    }else
    if( (last_blink / 1000) != (now / 1000) ){
      last_blink = now;
      led_change(((now / 1000) % 2) ? LED_BLINK_1 : LED_BLINK_2);
    }
  }

  if (irrecv.decode(&results)) {
    long ret = process_ir_receive();
    if( ret == 0 && receiving ){
      receiving = false;
      led_change(LED_CLEAR);
    }
  }

  bool pressed = false;
#if defined(ARDUINO_M5Stick_C) 
  pressed = M5.BtnA.wasPressed();
#elif defined(ARDUINO_M5Stack_ATOM)
  pressed = M5.Btn.wasPressed();
#elif defined(BUTTON_PORT)
  pressed = Btn.wasPressed();
#endif
  if( pressed ){
    Serial.println("Button pressed");
    start_receive = millis();
    if( !receiving ){
      Serial.println("now wait receiving");
      receiving = true;
    }
  }

  delay(1);
}

static long process_ir_receive(void)
{
  Serial.println("process_ir_receive");

  if(results.overflow){
    irrecv.resume();
    Serial.println("Overflow");
    return -1;
  }
  if( results.decode_type != decode_type_t::NEC || results.repeat ){
    irrecv.resume();
    Serial.println("not supported");
    return -1;
  }

  Serial.print(resultToHumanReadableBasic(&results));
  Serial.printf("address=%d, command=%d\n", results.address, results.command);

  jsonDoc.clear();
  jsonDoc["address"] = results.address;
  jsonDoc["command"] = results.command;
  jsonDoc["value"] = results.value;

  irrecv.resume();

  if( receiving ){
    long ret = httpPostJson(HTTP_POST_URL_REGISTER, jsonDoc);
    if( ret != 0 ){
      Serial.println("httpPostJson error");
      return ret;
    }
  }else{
    long ret = httpPostJson(HTTP_POST_URL_RECEIVE, jsonDoc);
    if( ret != 0 ){
      Serial.println("httpPostJson error");
      return ret;
    }
  }

  return 0;
}

static long wifi_connect(const char *ssid, const char *password, unsigned long timeout)
{
  Serial.println("");
  Serial.print("WiFi Connenting");

  if( ssid == NULL && password == NULL )
    WiFi.begin();
  else
    WiFi.begin(ssid, password);
  unsigned long past = 0;
  while (WiFi.status() != WL_CONNECTED){
    Serial.print(".");
    delay(500);
    past += 500;
    if( past > timeout ){
      Serial.println("\nCan't Connect");
      return -1;
    }
  }
  Serial.print("\nConnected : IP=");
  Serial.print(WiFi.localIP());
  Serial.print(" Mac=");
  Serial.println(WiFi.macAddress());

  return 0;
}

static long wifi_try_connect(bool infinit_loop)
{
  long ret = -1;
  do{
    ret = wifi_connect(WIFI_PASSWORD, WIFI_PASSWORD, WIFI_TIMEOUT);
    if( ret == 0 )
      return ret;

    Serial.print("\ninput SSID:");
    Serial.setTimeout(SERIAL_TIMEOUT1);
    char ssid[32 + 1] = {'\0'};
    ret = Serial.readBytesUntil('\r', ssid, sizeof(ssid) - 1);
    if( ret <= 0 )
      continue;

    delay(10);
    Serial.read();
    Serial.print("\ninput PASSWORD:");
    Serial.setTimeout(SERIAL_TIMEOUT2);
    char password[32 + 1] = {'\0'};
    ret = Serial.readBytesUntil('\r', password, sizeof(password) - 1);
    if( ret <= 0 )
      continue;

    delay(10);
    Serial.read();
    Serial.printf("\nSSID=%s PASSWORD=", ssid);
    for( int i = 0 ; i < strlen(password); i++ )
      Serial.print("*");
    Serial.println("");

    ret = wifi_connect(ssid, password, WIFI_TIMEOUT);
    if( ret == 0 )
      return ret;
  }while(infinit_loop);

  return ret;
}

static long httpPost(const char *p_url, const char *p_payload)
{
  HTTPClient http;
  http.begin(p_url);
  http.addHeader("Content-Type", "application/json");
  int status_code = http.POST(p_payload);
  Serial.printf("status_code=%d\r\n", status_code);
  if( status_code != 200 ){
    http.end();
    return -1;
  }
  Serial.println(http.getString());
  http.end();

  return 0;
}

static long httpPostJson(const char *p_url, JsonDocument& jdoc)
{
  int size = measureJson(jdoc);

  char *p_buffer = (char*)malloc(size + 1);
  int len = serializeJson(jdoc, p_buffer, size);
  p_buffer[len] = '\0';
  long ret = httpPost(p_url, p_buffer);
  free(p_buffer);

  return ret;
}
