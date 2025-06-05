// Hourly rate constant - change this value as needed
const HOURLY_RATE = 25; // PHP per hour

function doGet(e) {
  return handleResponse(e || {});
}

function doPost(e) {
  return handleResponse(e || {});
}

function handleResponse(e) {
  try {
    Logger.log('Received request:', e);

    let data;
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    } else {
      throw new Error('No data received');
    }

    if (!data.action) {
      throw new Error('No action specified');
    }

    let result;
    switch (data.action) {
      case 'register':
        result = handleRegistration(data);
        break;
      case 'attendance':
        result = handleAttendance(data);
        break;
      default:
        result = { status: 'error', message: 'Invalid action' };
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.message,
      debug: error.stack
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleRegistration(data) {
  setupSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');

  if (!sheet) return createResponse('error', 'Users sheet not found');

  const existingUser = findUserByUid(sheet, data.uid);
  if (existingUser) return createResponse('error', 'User already registered');

  // Add new user with required hours and calculate hours left
  const hoursRequired = parseFloat(data.hours_required) || 0;
  sheet.appendRow([
    data.uid, 
    data.email, 
    data.full_name,
    hoursRequired,  // HOURS_REQUIRED
    hoursRequired   // HOURS_LEFT (initially same as required)
  ]);
  
  const newRow = sheet.getLastRow();
  sheet.getRange(newRow, 4, 1, 2).setNumberFormat('0.00'); // Format both hours columns

  return createResponse('success', 'User registered successfully');
}

function handleAttendance(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const todayStr = formatDate(now);
  const currentTimeStr = formatTime(now);
  const sheetName = 'Daily_Attendance';
  let sheet = ss.getSheetByName(sheetName);

  Logger.log('Processing attendance for UID: ' + data.uid);
  Logger.log('Current date: ' + todayStr + ', time: ' + currentTimeStr);

  if (!sheet) {
    Logger.log('Creating Daily Attendance sheet');
    sheet = createDailyAttendanceSheet(ss, sheetName);
  }

  const usersSheet = ss.getSheetByName('Users');
  const userRow = findUserByUid(usersSheet, data.uid);
  if (!userRow) {
    Logger.log('User not found: ' + data.uid);
    return createResponse('error', 'User not found');
  }
  const userName = userRow[2];
  Logger.log('Found user: ' + userName);

  // Check if user already has a completed attendance for today
  const hasCompletedAttendance = checkCompletedAttendance(sheet, data.uid, todayStr);
  if (hasCompletedAttendance) {
    Logger.log('User already completed attendance for today');
    return createResponse('error', 'You have already completed your attendance for today. Please scan again tomorrow.');
  }

  // Find the most recent record for this user with empty TIME_OUT for today
  const lastRow = sheet.getLastRow();
  let matchRowIndex = -1;
  
  for (let i = 2; i <= lastRow; i++) {
    const rowDate = sheet.getRange(i, 1).getValue();
    const rowUID = sheet.getRange(i, 2).getValue();
    const timeOut = sheet.getRange(i, 5).getValue();
    
    // Check if it's today's date and same user with no TIME_OUT
    if (formatDate(rowDate) === todayStr && rowUID === data.uid && (!timeOut || timeOut.toString().trim() === '')) {
      matchRowIndex = i;
      Logger.log(`Found matching record at row ${i}`);
      break;
    }
  }

  if (matchRowIndex === -1) {
    // TIME_IN scan - Add with proper spacing
    Logger.log('No existing TIME_IN found. Creating new TIME_IN record.');
    
    // Check if we need to add spacing (if last entry is from different date)
    if (lastRow > 1) {
      const lastEntryDate = sheet.getRange(lastRow, 1).getValue();
      if (formatDate(lastEntryDate) !== todayStr) {
        // Add two empty rows for spacing
        sheet.appendRow(['', '', '', '', '', '']);
        sheet.appendRow(['', '', '', '', '', '']);
      }
    }
    
    sheet.appendRow([todayStr, data.uid, userName, currentTimeStr, '', '']);
    
    const newRowIndex = sheet.getLastRow();
    sheet.getRange(newRowIndex, 1).setNumberFormat('yyyy-mm-dd'); // DATE
    sheet.getRange(newRowIndex, 4).setNumberFormat('HH:mm'); // TIME_IN
    sheet.getRange(newRowIndex, 5).setNumberFormat('HH:mm'); // TIME_OUT
    sheet.getRange(newRowIndex, 6).setNumberFormat('0.00');  // HOURS
    
    Logger.log('TIME_IN recorded at row ' + newRowIndex);
    return createResponse('success', 'Time In recorded at ' + currentTimeStr + '. Please scan again to clock out.');
  } else {
    // TIME_OUT scan
    Logger.log('Found existing TIME_IN record at row ' + matchRowIndex + '. Recording TIME_OUT.');
    
    // Get TIME_IN value
    const timeInCell = sheet.getRange(matchRowIndex, 4);
    let timeInValue = timeInCell.getValue();
    
    Logger.log('Raw TIME_IN value:', timeInValue);
    Logger.log('TIME_IN type:', typeof timeInValue);
    
    // Set TIME_OUT first
    sheet.getRange(matchRowIndex, 5).setValue(currentTimeStr);
    Logger.log('Set TIME_OUT to: ' + currentTimeStr);
    
    // Calculate hours with improved logic
    let calculatedHours = calculateHoursFromTimes(timeInValue, currentTimeStr);
    
    // Set the calculated hours
    const hoursCell = sheet.getRange(matchRowIndex, 6);
    hoursCell.setValue(calculatedHours);
    hoursCell.setNumberFormat('0.00');
    
    Logger.log('Set HOURS to:', calculatedHours, 'in cell F' + matchRowIndex);
    
    // Force spreadsheet to update
    SpreadsheetApp.flush();
    
    // Update user's hours left
    updateUserHoursLeft(data.uid, calculatedHours);
    
    // Create success message
    const hoursFormatted = formatHoursMinutes(calculatedHours);
    const successMsg = `Time Out recorded at ${currentTimeStr}. Duration: ${hoursFormatted}`;
    return createResponse('success', successMsg);
  }
}

function updateUserHoursLeft(uid, hoursWorked) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const userIndex = findUserByUidIndex(usersSheet, uid);
  
  if (userIndex <= 0) return;
  
  const currentHoursLeft = usersSheet.getRange(userIndex, 5).getValue();
  const newHoursLeft = Math.max(0, currentHoursLeft - hoursWorked);
  
  usersSheet.getRange(userIndex, 5).setValue(newHoursLeft);
  usersSheet.getRange(userIndex, 5).setNumberFormat('0.00');
}

// Check if a user already has completed their attendance for a specific date
function checkCompletedAttendance(sheet, uid, dateStr) {
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowDate = formatDate(row[0]);
    const rowUid = row[1];
    const timeOut = row[4];
    
    if (rowDate === dateStr && rowUid === uid && timeOut && timeOut.toString().trim() !== '') {
      return true;
    }
  }
  
  return false;
}

function calculateHoursFromTimes(timeIn, timeOut) {
  try {
    let timeInMinutes = 0;
    let timeOutMinutes = 0;
    
    // Convert TIME_IN
    if (timeIn instanceof Date) {
      timeInMinutes = timeIn.getHours() * 60 + timeIn.getMinutes();
    } else if (typeof timeIn === 'string' && timeIn.includes(':')) {
      const parts = timeIn.split(':');
      timeInMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (typeof timeIn === 'number') {
      timeInMinutes = Math.round(timeIn * 24 * 60);
    }
    
    // Convert TIME_OUT
    if (typeof timeOut === 'string' && timeOut.includes(':')) {
      const parts = timeOut.split(':');
      timeOutMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (timeOut instanceof Date) {
      timeOutMinutes = timeOut.getHours() * 60 + timeOut.getMinutes();
    } else if (typeof timeOut === 'number') {
      timeOutMinutes = Math.round(timeOut * 24 * 60);
    }
    
    // Calculate difference
    let diffMinutes = timeOutMinutes - timeInMinutes;
    
    // Handle overnight case
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60;
    }
    
    // Convert to hours and round to 2 decimal places
    const calculatedHours = Math.round((diffMinutes / 60) * 100) / 100;
    return Math.max(0.01, calculatedHours); // Minimum 0.01 hours
    
  } catch (error) {
    Logger.log('Error calculating hours:', error.message);
    return 0.01;
  }
}

function formatHoursMinutes(totalHours) {
  const hours = Math.floor(totalHours);
  const minutes = Math.round((totalHours - hours) * 60);
  
  if (hours === 0) {
    return `${minutes} mins`;
  } else if (minutes === 0) {
    return `${hours} hrs`;
  } else {
    return `${hours} hrs ${minutes} mins`;
  }
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Setup Users sheet
  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.appendRow(['UID', 'EMAIL', 'FULL_NAME', 'HOURS_REQUIRED', 'HOURS_LEFT']);
    usersSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    usersSheet.getRange('D:E').setNumberFormat('0.00');
  }

  // Setup Daily Attendance sheet (single sheet for all days)
  let attendanceSheet = ss.getSheetByName('Daily_Attendance');
  if (!attendanceSheet) {
    attendanceSheet = ss.insertSheet('Daily_Attendance');
    attendanceSheet.appendRow(['DATE', 'UID', 'FULL_NAME', 'TIME_IN', 'TIME_OUT', 'HOURS']);
    attendanceSheet.getRange(1, 1, 1, 6).setBackground('#f3f3f3').setFontWeight('bold');
    attendanceSheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
    attendanceSheet.getRange('D:E').setNumberFormat('HH:mm');
    attendanceSheet.getRange('F:F').setNumberFormat('0.00');
  }

  // Setup Monthly Summary sheet
  let summarySheet = ss.getSheetByName('Monthly_Summary');
  if (!summarySheet) {
    summarySheet = ss.insertSheet('Monthly_Summary');
    summarySheet.appendRow(['MONTH', 'UID', 'FULL_NAME', 'HOURS_WORKED', 'SALARY']);
    summarySheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    summarySheet.getRange('D:D').setNumberFormat('0.00');
    summarySheet.getRange('E:E').setNumberFormat('#,##0.00');
  }

  // Create monthly summary trigger if it doesn't exist
  createMonthlySummaryTrigger();
}

function createMonthlySummaryTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let hasMonthlyTrigger = false;

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'generateMonthlySummary') {
      hasMonthlyTrigger = true;
    }
  });

  if (!hasMonthlyTrigger) {
    ScriptApp.newTrigger('generateMonthlySummary')
      .timeBased()
      .onMonthDay(1)
      .atHour(0)
      .create();
  }
}

function generateMonthlySummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const attendanceSheet = ss.getSheetByName('Daily_Attendance');
  const summarySheet = ss.getSheetByName('Monthly_Summary');

  if (!attendanceSheet || !summarySheet) return;

  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const monthYear = Utilities.formatDate(lastMonth, Session.getScriptTimeZone(), 'yyyy-MM');

  // Get all attendance records
  const attendanceData = attendanceSheet.getDataRange().getValues();
  const monthlyData = new Map();

  // Skip header row
  for (let i = 1; i < attendanceData.length; i++) {
    const row = attendanceData[i];
    const date = row[0];
    const uid = row[1];
    const name = row[2];
    const hours = parseFloat(row[5]) || 0;

    if (date && Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM') === monthYear) {
      const key = `${uid}|${name}`;
      if (!monthlyData.has(key)) {
        monthlyData.set(key, { hours: 0, salary: 0 });
      }
      monthlyData.get(key).hours += hours;
      monthlyData.get(key).salary += hours * HOURLY_RATE;
    }
  }

  // Add summary rows
  for (const [key, data] of monthlyData) {
    const [uid, name] = key.split('|');
    summarySheet.appendRow([
      monthYear,
      uid,
      name,
      Math.round(data.hours * 100) / 100,
      Math.round(data.salary * 100) / 100
    ]);
  }
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Attendance System')
    .addItem('Generate Monthly Summary', 'generateMonthlySummary')
    .addItem('Change Hourly Rate', 'changeHourlyRate')
    .addSeparator()
    .addItem('Setup Sheets', 'setupSheets')
    .addItem('Recalculate Hours Left', 'recalculateAllHoursLeft')
    .addToUi();
}

// Function to change the hourly rate
function changeHourlyRate() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Change Hourly Rate',
    `Current rate is ₱${HOURLY_RATE} per hour.\nEnter new hourly rate (numbers only):`,
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() == ui.Button.OK) {
    const newRate = parseFloat(response.getResponseText());
    if (!isNaN(newRate) && newRate > 0) {
      ui.alert(`Please update the HOURLY_RATE constant in the script to ${newRate} and regenerate monthly summaries if needed.`);
    } else {
      ui.alert('Invalid rate entered. Please enter a valid number.');
    }
  }
}

// Function to recalculate hours left for all users
function recalculateAllHoursLeft() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const attendanceSheet = ss.getSheetByName('Daily_Attendance');
  
  if (!usersSheet || !attendanceSheet) {
    SpreadsheetApp.getUi().alert('Required sheets not found');
    return;
  }
  
  const userData = usersSheet.getDataRange().getValues();
  const attendanceData = attendanceSheet.getDataRange().getValues();
  
  // Skip header row for users
  for (let i = 1; i < userData.length; i++) {
    const uid = userData[i][0];
    const hoursRequired = userData[i][3];
    
    // Calculate total hours worked for this user
    let totalHoursWorked = 0;
    for (let j = 1; j < attendanceData.length; j++) {
      if (attendanceData[j][1] === uid) {
        const hours = parseFloat(attendanceData[j][5]) || 0;
        totalHoursWorked += hours;
      }
    }
    
    // Update hours left
    const hoursLeft = Math.max(0, hoursRequired - totalHoursWorked);
    usersSheet.getRange(i + 1, 5).setValue(hoursLeft);
  }
  
  SpreadsheetApp.getUi().alert('Hours left recalculated for all users');
}

function createDailyAttendanceSheet(spreadsheet, sheetName) {
  const sheet = spreadsheet.insertSheet(sheetName);
  sheet.appendRow(['DATE', 'UID', 'FULL_NAME', 'TIME_IN', 'TIME_OUT', 'HOURS']);
  sheet.getRange(1, 1, 1, 6).setBackground('#f3f3f3').setFontWeight('bold');
  sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('D:E').setNumberFormat('HH:mm');
  sheet.getRange('F:F').setNumberFormat('0.00');
  return sheet;
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm');
}

function findUserByUid(sheet, uid) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === uid) {
      return data[i];
    }
  }
  return null;
}

function findUserByUidIndex(sheet, uid) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === uid) {
      return i + 1;
    }
  }
  return -1;
}

function createResponse(status, message) {
  return {
    status: status,
    message: message
  };
}