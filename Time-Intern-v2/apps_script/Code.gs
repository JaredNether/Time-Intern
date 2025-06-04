// Add this at the very beginning of your script
function doPost(e) {
  return handleResponse(e || {}, true);
}

function handleResponse(e, addCors) {
  const output = ContentService.createTextOutput();
  let result;

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

  } catch (error) {
    result = {
      status: 'error',
      message: error.message,
      debug: error.stack
    };
  }

  if (addCors) {
    output.setMimeType(ContentService.MimeType.JSON);
    output.setContent(JSON.stringify(result));
    return output.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  return output;
}

// Hourly rate constant - change this value as needed
const HOURLY_RATE = 25; // PHP per hour

function doGet(e) {
  return handleResponse(e || {});
}

function handleRegistration(data) {
  setupSheets();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users');

  if (!sheet) return createResponse('error', 'Users sheet not found');

  const existingUser = findUserByUid(sheet, data.uid);
  if (existingUser) return createResponse('error', 'User already registered');

  // Add new user with 0 hours and 0 salary
  sheet.appendRow([data.uid, data.email, data.full_name, 0.00, 0.00]);
  const newRow = sheet.getLastRow();
  sheet.getRange(newRow, 4).setNumberFormat('0.00'); // TOTAL_HOURS
  sheet.getRange(newRow, 5).setNumberFormat('#,##0.00'); // SALARY

  return createResponse('success', 'User registered successfully');
}

function handleAttendance(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const todayStr = formatDate(now);
  const currentTimeStr = formatTime(now);
  const sheetName = `Attendance_${todayStr}`;
  let sheet = ss.getSheetByName(sheetName);

  Logger.log('Processing attendance for UID: ' + data.uid);
  Logger.log('Current date: ' + todayStr + ', time: ' + currentTimeStr);

  if (!sheet) {
    Logger.log('Creating new attendance sheet for today');
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
  const hasCompletedAttendance = checkCompletedAttendance(sheet, data.uid);
  if (hasCompletedAttendance) {
    Logger.log('User already completed attendance for today');
    return createResponse('error', 'You have already completed your attendance for today. Please scan again tomorrow.');
  }

  // Find the most recent record for this user with empty TIME_OUT
  const lastRow = sheet.getLastRow();
  let matchRowIndex = -1;
  
  for (let i = 2; i <= lastRow; i++) {
    const rowUID = sheet.getRange(i, 2).getValue();
    const timeOut = sheet.getRange(i, 5).getValue();
    
    Logger.log(`Row ${i}: UID=${rowUID}, TIME_OUT=${timeOut}, Checking against UID=${data.uid}`);
    
    if (rowUID === data.uid && (!timeOut || timeOut.toString().trim() === '')) {
      matchRowIndex = i;
      Logger.log(`Found matching record at row ${i}`);
      break;
    }
  }

  if (matchRowIndex === -1) {
    // TIME_IN scan
    Logger.log('No existing TIME_IN found. Creating new TIME_IN record.');
    sheet.appendRow([todayStr, data.uid, userName, currentTimeStr, '', '']);
    
    const newRowIndex = sheet.getLastRow();
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
    let calculatedHours = 0;
    
    try {
      // Convert TIME_IN to minutes since midnight
      let timeInMinutes = 0;
      
      if (timeInValue instanceof Date) {
        timeInMinutes = timeInValue.getHours() * 60 + timeInValue.getMinutes();
        Logger.log('TIME_IN as Date - Hours:', timeInValue.getHours(), 'Minutes:', timeInValue.getMinutes());
      } else if (typeof timeInValue === 'string' && timeInValue.includes(':')) {
        const timeParts = timeInValue.split(':');
        timeInMinutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
        Logger.log('TIME_IN as string - parsed to minutes:', timeInMinutes);
      } else if (typeof timeInValue === 'number') {
        timeInMinutes = Math.round(timeInValue * 24 * 60);
        Logger.log('TIME_IN as number - converted to minutes:', timeInMinutes);
      } else {
        const displayValue = timeInCell.getDisplayValue();
        Logger.log('Using display value:', displayValue);
        if (displayValue && displayValue.includes(':')) {
          const timeParts = displayValue.split(':');
          timeInMinutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
        }
      }
      
      // Convert current time to minutes since midnight
      const currentTimeParts = currentTimeStr.split(':');
      const currentMinutes = parseInt(currentTimeParts[0]) * 60 + parseInt(currentTimeParts[1]);
      
      Logger.log('TIME_IN minutes:', timeInMinutes, 'Current time minutes:', currentMinutes);
      
      // Calculate difference
      let diffMinutes = currentMinutes - timeInMinutes;
      
      // Handle overnight case
      if (diffMinutes < 0) {
        diffMinutes += 24 * 60;
      }
      
      // Convert to hours and round to 2 decimal places
      calculatedHours = Math.round((diffMinutes / 60) * 100) / 100;
      
      Logger.log('Calculated hours:', calculatedHours);
      
      // Ensure the value is valid
      if (isNaN(calculatedHours) || !isFinite(calculatedHours) || calculatedHours < 0) {
        Logger.log('Invalid calculation result, using default');
        calculatedHours = 0.01;
      }
      
    } catch (error) {
      Logger.log('Error in hours calculation:', error.message);
      calculatedHours = 0.01;
    }
    
    // Set the calculated hours
    const hoursCell = sheet.getRange(matchRowIndex, 6);
    hoursCell.setValue(calculatedHours);
    hoursCell.setNumberFormat('0.00');
    
    Logger.log('Set HOURS to:', calculatedHours, 'in cell F' + matchRowIndex);
    
    // Force spreadsheet to update
    SpreadsheetApp.flush();
    
    // Update total hours and salary in Users sheet
    updateUserTotalHoursAndSalary(data.uid);
    
    // Create success message with salary info
    const hoursFormatted = formatHoursMinutes(calculatedHours);
    const currentSalary = getUserCurrentSalary(data.uid);
    const successMsg = `Time Out recorded at ${currentTimeStr}. Duration: ${hoursFormatted}. Total Salary: ₱${currentSalary.toFixed(2)}`;
    return createResponse('success', successMsg);
  }
}

// Get user's current total salary
function getUserCurrentSalary(uid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const userRow = findUserByUid(usersSheet, uid);
  
  if (userRow && userRow.length >= 5) {
    return userRow[4] || 0; // SALARY column
  }
  return 0;
}

// Check if a user already has completed their attendance for the day
function checkCompletedAttendance(sheet, uid) {
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowUid = row[1];
    const timeOut = row[4];
    
    if (rowUid === uid && timeOut && timeOut.toString().trim() !== '') {
      return true;
    }
  }
  
  return false;
}

// Update both total hours and salary for a specific user
function updateUserTotalHoursAndSalary(uid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  const userIndex = findUserByUidIndex(usersSheet, uid);
  
  if (userIndex <= 0) {
    Logger.log('User not found for total hours update: ' + uid);
    return;
  }
  
  const sheets = ss.getSheets();
  let totalHours = 0;
  
  Logger.log(`Starting hours calculation for user ${uid}`);
  
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const sheetName = sheet.getName();
    
    if (sheetName.startsWith('Attendance_')) {
      Logger.log(`Checking sheet: ${sheetName}`);
      
      const values = sheet.getDataRange().getValues();
      
      for (let j = 1; j < values.length; j++) {
        const row = values[j];
        const rowUid = row[1];
        
        if (rowUid === uid) {
          let hoursValue = row[5]; // HOURS column
          
          if (hoursValue !== null && hoursValue !== '' && hoursValue !== undefined) {
            let hours = 0;
            
            if (typeof hoursValue === 'number') {
              hours = hoursValue;
            } else if (typeof hoursValue === 'string') {
              hours = parseFloat(hoursValue.replace(/[^\d.-]/g, ''));
            }
            
            if (!isNaN(hours) && isFinite(hours) && hours > 0) {
              Logger.log(`Found valid hours: ${hours} in sheet ${sheetName} row ${j+1}`);
              totalHours += hours;
            }
          }
        }
      }
    }
  }
  
  totalHours = Math.round(totalHours * 100) / 100;
  const totalSalary = Math.round(totalHours * HOURLY_RATE * 100) / 100;
  
  Logger.log(`Setting total hours for user ${uid} to ${totalHours} and salary to ₱${totalSalary}`);
  
  try {
    if (isNaN(totalHours) || !isFinite(totalHours)) {
      totalHours = 0.00;
      totalSalary = 0.00;
    }
    
    // Update total hours (column D)
    const hoursCell = usersSheet.getRange(userIndex, 4);
    hoursCell.setValue(totalHours);
    hoursCell.setNumberFormat('0.00');
    
    // Update salary (column E)
    const salaryCell = usersSheet.getRange(userIndex, 5);
    salaryCell.setValue(totalSalary);
    salaryCell.setNumberFormat('#,##0.00');
    
    SpreadsheetApp.flush();
    Logger.log(`Successfully updated total hours and salary for user ${uid}`);
  } catch (e) {
    Logger.log(`Error updating total hours and salary: ${e.message}`);
  }
}

// Legacy function for backward compatibility
function updateUserTotalHours(uid) {
  updateUserTotalHoursAndSalary(uid);
}

// Calculate salary for all users
function calculateAllUsersSalary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  
  if (!usersSheet) {
    Logger.log('Users sheet not found');
    return;
  }
  
  const userData = usersSheet.getDataRange().getValues();
  
  // Skip header row, start from row 2
  for (let i = 1; i < userData.length; i++) {
    const uid = userData[i][0];
    updateUserTotalHoursAndSalary(uid);
  }
  
  Logger.log('Calculated salaries for all users');
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

  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.appendRow(['UID', 'EMAIL', 'FULL_NAME', 'TOTAL_HOURS', 'SALARY']);
    usersSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    usersSheet.getRange('D:D').setNumberFormat('0.00');
    usersSheet.getRange('E:E').setNumberFormat('#,##0.00');
  } else {
    // Check if SALARY column exists, if not add it
    const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    if (headers.length < 5 || headers[4] !== 'SALARY') {
      usersSheet.getRange(1, 5).setValue('SALARY');
      usersSheet.getRange(1, 5).setFontWeight('bold');
      usersSheet.getRange('E:E').setNumberFormat('#,##0.00');
      
      // Calculate salaries for existing users
      calculateAllUsersSalary();
    }
  }

  const today = new Date();
  const sheetName = `Attendance_${formatDate(today)}`;
  if (!ss.getSheetByName(sheetName)) {
    createDailyAttendanceSheet(ss, sheetName);
  }
  
  const qrSheet = ss.getSheetByName('QRTracking');
  if (qrSheet) {
    ss.deleteSheet(qrSheet);
  }
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Attendance System')
    .addItem('Recalculate All Hours & Salaries', 'calculateAllUsersSalary')
    .addItem('Setup Salary Column', 'setupSalaryColumn')
    .addItem('Change Hourly Rate', 'changeHourlyRate')
    .addSeparator()
    .addItem('Create Tomorrow\'s Sheet', 'createNextDaySheet')
    .addItem('Setup Sheets', 'setupSheets')
    .addItem('Fix Hours Calculation', 'fixAllHoursCalculation')
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
      // Note: This will only change the rate for new calculations
      // You'll need to manually update the HOURLY_RATE constant in the script
      ui.alert(`Please update the HOURLY_RATE constant in the script to ${newRate} and recalculate all salaries.`);
    } else {
      ui.alert('Invalid rate entered. Please enter a valid number.');
    }
  }
}

// Function to setup the salary column if it doesn't exist
function setupSalaryColumn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const usersSheet = ss.getSheetByName('Users');
  
  if (!usersSheet) {
    SpreadsheetApp.getUi().alert('Users sheet not found');
    return;
  }
  
  const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
  
  if (headers.length < 5 || headers[4] !== 'SALARY') {
    usersSheet.getRange(1, 5).setValue('SALARY');
    usersSheet.getRange(1, 5).setFontWeight('bold');
    usersSheet.getRange('E:E').setNumberFormat('#,##0.00');
    
    calculateAllUsersSalary();
    
    SpreadsheetApp.getUi().alert(`Salary column added with ₱${HOURLY_RATE}/hour rate and calculated for all users`);
  } else {
    SpreadsheetApp.getUi().alert('Salary column already exists');
  }
}

// Function to fix existing hours calculations and recalculate salaries
function fixAllHoursCalculation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();
  
  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const sheetName = sheet.getName();
    
    if (sheetName.startsWith('Attendance_')) {
      Logger.log(`Fixing hours in sheet: ${sheetName}`);
      
      const data = sheet.getDataRange().getValues();
      
      for (let row = 1; row < data.length; row++) {
        const timeIn = data[row][3]; // Column D
        const timeOut = data[row][4]; // Column E
        const currentHours = data[row][5]; // Column F
        
        if (timeIn && timeOut && (currentHours === '' || currentHours === null || 
            typeof currentHours === 'string' && currentHours.includes('#'))) {
          
          const calculatedHours = calculateHoursFromTimes(timeIn, timeOut);
          
          if (calculatedHours > 0) {
            sheet.getRange(row + 1, 6).setValue(calculatedHours);
            Logger.log(`Fixed row ${row + 1}: ${calculatedHours} hours`);
          }
        }
      }
    }
  }
  
  SpreadsheetApp.flush();
  calculateAllUsersSalary(); // Recalculate all salaries after fixing hours
  SpreadsheetApp.getUi().alert('Hours calculation fixed and salaries recalculated for all users');
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
    if (timeOut instanceof Date) {
      timeOutMinutes = timeOut.getHours() * 60 + timeOut.getMinutes();
    } else if (typeof timeOut === 'string' && timeOut.includes(':')) {
      const parts = timeOut.split(':');
      timeOutMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    } else if (typeof timeOut === 'number') {
      timeOutMinutes = Math.round(timeOut * 24 * 60);
    }
    
    // Calculate difference
    let diffMinutes = timeOutMinutes - timeInMinutes;
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60;
    }
    
    return Math.round((diffMinutes / 60) * 100) / 100;
  } catch (error) {
    Logger.log('Error calculating hours:', error.message);
    return 0;
  }
}

function recalculateAllUserHours() {
  calculateAllUsersSalary(); // This now handles both hours and salary
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

function createTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('createNextDaySheet').timeBased().everyDays(1).atHour(0).create();
}

function createNextDaySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sheetName = `Attendance_${formatDate(tomorrow)}`;
  if (!ss.getSheetByName(sheetName)) {
    createDailyAttendanceSheet(ss, sheetName);
  }
}