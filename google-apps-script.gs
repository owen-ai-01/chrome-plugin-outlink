/**
 * Outlink Collector -> Google Sheets receiver.
 * Deploy as a Google Apps Script Web App, execute as yourself, and restrict access
 * to the audience you choose. Paste the resulting /exec URL into the extension.
 */
function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    writeObjects_(spreadsheet, payload.sheetName || "Resources", payload.resources || []);
    writeObjects_(spreadsheet, "PostingLogs", payload.publish || []);
    writeObjects_(spreadsheet, "TargetSites", payload.targetSites || []);
    return json_({ ok: true, resources: (payload.resources || []).length, publish: (payload.publish || []).length });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message || error) });
  }
}

function doGet() {
  return json_({ ok: true, service: "Outlink Collector Google Sheets receiver" });
}

function writeObjects_(spreadsheet, sheetName, rows) {
  var sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  sheet.clearContents();
  if (!rows.length) return;
  var keyMap = {};
  rows.forEach(function(row) { Object.keys(row || {}).forEach(function(key) { keyMap[key] = true; }); });
  var headers = Object.keys(keyMap);
  var values = [headers].concat(rows.map(function(row) {
    return headers.map(function(key) {
      var value = row[key];
      return value && typeof value === "object" ? JSON.stringify(value) : (value == null ? "" : value);
    });
  }));
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
