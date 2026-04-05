#include <WiFi.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>

const char* ssid = "moto g power (2021)_2241";
const char* password = "Thatcher";
const char* serverUrl = "http://10.136.159.11:3001/api/tag";

const uint16_t COMPANY_ID = 0x1234;
const char* GATEWAY_ID = "Room2";   // unique per base station: Room1, Room2, Room3
const char* FLOOR      = "2F";      // floor this base station is on: 1F, 2F, 3F …

NimBLEScan* pBLEScan;

#define MAX_QUEUE 20
String payloadQueue[MAX_QUEUE];  // Jareth wuz here!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
int queueCount = 0;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connection failed");
  }
}

class ScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* device) override {
    if (!device->haveManufacturerData()) return;

    std::string mfg = device->getManufacturerData();
    if (mfg.length() < 6) return;

    const uint8_t* data = reinterpret_cast<const uint8_t*>(mfg.data());

    uint16_t companyId = data[0] | (data[1] << 8);
    if (companyId != COMPANY_ID) return;

    uint16_t tagId = data[2] | (data[3] << 8);
    uint8_t battery = data[4];
    uint8_t flags = data[5];
    int rssi = device->getRSSI();

    if (queueCount >= MAX_QUEUE) return;

    char tagHex[5];
    snprintf(tagHex, sizeof(tagHex), "%04X", tagId);

    String payload = "{";
    payload += "\"tag_id\":\"" + String(tagHex) + "\",";
    payload += "\"gateway_id\":\"" + String(GATEWAY_ID) + "\",";
    payload += "\"floor\":\"" + String(FLOOR) + "\",";
    payload += "\"rssi\":" + String(rssi) + ",";
    payload += "\"battery\":" + String(battery) + ",";
    payload += "\"flags\":" + String(flags);
    payload += "}";

    payloadQueue[queueCount++] = payload;

    Serial.print("Queued tag: ");
    Serial.println(tagHex);
  }
};

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectWiFi();

  NimBLEDevice::init("");
  pBLEScan = NimBLEDevice::getScan();
  pBLEScan->setScanCallbacks(new ScanCallbacks(), false);
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(30);
  pBLEScan->setWindow(30);

  Serial.println("Gateway ready");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  queueCount = 0;

  Serial.println("BLE scanning...");
  pBLEScan->start(500, false);
  delay(500);

  Serial.print("Queued detections: ");
  Serial.println(queueCount);

  for (int i = 0; i < queueCount; i++) {
    if (WiFi.status() != WL_CONNECTED) {
      connectWiFi();
      if (WiFi.status() != WL_CONNECTED) {
        Serial.println("Skipping POST, no WiFi");
        break;
      }
    }

    Serial.println("Sending payload:");
    Serial.println(payloadQueue[i]);

    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(5000);

    int responseCode = http.POST(payloadQueue[i]);

    Serial.print("POST response: ");
    Serial.println(responseCode);

    if (responseCode > 0) {
      Serial.println(http.getString());
    }

    http.end();
    delay(100);
  }

  pBLEScan->clearResults();
  delay(2000);
}