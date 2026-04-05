#include <bluefruit.h>

extern "C" {
  #include "nrf.h"
  #include "nrf_soc.h"
}

#define TAG_ID             0xA1B2
#define COMPANY_ID         0x1234
#define ADV_INTERVAL_MS    50
#define ADV_BURST_SEC      20
#define SLEEP_SEC          5

#ifndef LED_BUILTIN
#define LED_BUILTIN 13
#endif

#define LED_PIN LED_BUILTIN

volatile bool rtcEvent = false;

enum TagState {
  STATE_ADVERTISING,
  STATE_SLEEPING
};

TagState state = STATE_ADVERTISING;

extern "C" void RTC2_IRQHandler(void) {
  if (NRF_RTC2->EVENTS_COMPARE[0]) {
    NRF_RTC2->EVENTS_COMPARE[0] = 0;
    rtcEvent = true;
  }
}

void setupRtc2() {
  NRF_RTC2->TASKS_STOP = 1;
  NRF_RTC2->TASKS_CLEAR = 1;
  NRF_RTC2->PRESCALER = 32767; // 1 Hz
  NRF_RTC2->EVTENSET = RTC_EVTENSET_COMPARE0_Msk;
  NRF_RTC2->INTENSET = RTC_INTENSET_COMPARE0_Msk;

  NVIC_ClearPendingIRQ(RTC2_IRQn);
  NVIC_SetPriority(RTC2_IRQn, 6);
  NVIC_EnableIRQ(RTC2_IRQn);

  NRF_RTC2->TASKS_START = 1;
}

void scheduleRtcSeconds(uint32_t seconds) {
  NRF_RTC2->TASKS_STOP = 1;
  NRF_RTC2->TASKS_CLEAR = 1;
  rtcEvent = false;
  NRF_RTC2->EVENTS_COMPARE[0] = 0;
  NRF_RTC2->CC[0] = seconds;
  NRF_RTC2->TASKS_START = 1;
}

uint8_t readBatteryPercent() {
  // nRF52840 VBAT is on A6 (P0.29), divided by 2 internally
  // Reference = 3.6 V internal, 12-bit ADC
  analogReference(AR_INTERNAL_3_0);
  analogReadResolution(12);

  int raw = analogRead(PIN_VBAT);          // 0–4095
  float voltage = raw * 3.0f / 4095.0f * 2.0f;  // ×2 for the on-board divider

  // LiPo discharge curve: ~4.2V full, ~3.2V empty
  int pct = (int)((voltage - 3.2f) / (4.2f - 3.2f) * 100.0f);
  if (pct > 100) pct = 100;
  if (pct < 0)   pct = 0;

  Serial.print("VBAT raw="); Serial.print(raw);
  Serial.print(" V="); Serial.print(voltage, 2);
  Serial.print(" pct="); Serial.println(pct);

  return (uint8_t)pct;
}

void setupAdvertisingPayload() {
  uint8_t rawData[6];

  rawData[0] = COMPANY_ID & 0xFF;
  rawData[1] = (COMPANY_ID >> 8) & 0xFF;
  rawData[2] = TAG_ID & 0xFF;
  rawData[3] = (TAG_ID >> 8) & 0xFF;
  rawData[4] = readBatteryPercent();
  rawData[5] = 0x00;

  Bluefruit.Advertising.clearData();
  Bluefruit.ScanResponse.clearData();

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addManufacturerData(rawData, 6);

  uint16_t advUnits = (ADV_INTERVAL_MS * 1000) / 625;
  Bluefruit.Advertising.setInterval(advUnits, advUnits);
  Bluefruit.Advertising.setFastTimeout(0);
  Bluefruit.Advertising.restartOnDisconnect(false);
}

void startAdvertising() {
  Bluefruit.Advertising.stop();
  delay(50);

  setupAdvertisingPayload();

  digitalWrite(LED_PIN, HIGH);   // LED ON = broadcasting

  Serial.print("RAW: ");
  Serial.print(COMPANY_ID & 0xFF, HEX); Serial.print(" ");
  Serial.print((COMPANY_ID >> 8) & 0xFF, HEX); Serial.print(" ");
  Serial.print(TAG_ID & 0xFF, HEX); Serial.print(" ");
  Serial.print((TAG_ID >> 8) & 0xFF, HEX); Serial.print(" ");
  Serial.print(readBatteryPercent(), HEX); Serial.print(" ");
  Serial.println(0x00, HEX);

  Bluefruit.Advertising.start(0);
  Serial.println("Tag advertising...");
}

void stopAdvertising() {
  Bluefruit.Advertising.stop();
  digitalWrite(LED_PIN, LOW);    // LED OFF = sleeping
  Serial.println("Tag stopped advertising.");
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.begin(115200);
  delay(2000);
  Serial.println("NEW RAWDATA FW");

  Bluefruit.begin();
  Bluefruit.autoConnLed(false);
  Bluefruit.Advertising.clearData();
  Bluefruit.setTxPower(0);
  Bluefruit.setName("AssetTag");

  setupRtc2();

  startAdvertising();
  scheduleRtcSeconds(ADV_BURST_SEC);
  state = STATE_ADVERTISING;

  Serial.println("nRF52840 tag started.");
}

void loop() {
  if (rtcEvent) {
    rtcEvent = false;

    if (state == STATE_ADVERTISING) {
      stopAdvertising();
      scheduleRtcSeconds(SLEEP_SEC);
      state = STATE_SLEEPING;
      Serial.println("Entering low-power sleep window...");
    } else {
      startAdvertising();
      scheduleRtcSeconds(ADV_BURST_SEC);
      state = STATE_ADVERTISING;
    }
  }

  sd_app_evt_wait();
}