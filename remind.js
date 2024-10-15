const fs = require("fs");
const path = require("path");
const { env, argv } = require("process");
const { spawn } = require("child_process");

const reSeparatorDefinitionLine = /^separator:.{1,3}$/;
const reValidWeekday = /^[A-Za-z]{2,}(,[A-Za-z]{2,})*$/;
const reValidDay = /^\d{1,2}$/;
const reValidMonthday = /^\d{1,2} \d{1,2}$/;
const reValidFulldate = /^\d{4} \d{1,2} \d{1,2}$/;
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const dateOptions = {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'};

const currentEvents = [];
const printDebug = false;

function debug() {
  if (!printDebug) {
    return;
  }
  console.log("[DEBUG]", ...arguments);
}

function getRemindFile(cb) {
  const filename = "remind.txt";
  const filepaths = [
    `/etc/${filename}`,
    `${env.HOME}/${filename}`,
    `${__dirname}/${filename}`,
  ];

  for (const filepath of filepaths) {
    debug("file:", filepath);
    fs.stat(filepath, function(err, content) {
      if (err && err.errno === -2) {
        debug("remind file error:", err.errno);
        return;
      }
      // TODO what if no file found?
      return cb(undefined, filepath);
    });
  }
}

function readFileIgnoringAllLinesUntilSeparator(filepath, cb) {
  fs.readFile(filepath, function(err, contents) {
    if (err) {
      return cb(err, undefined);
    }
    // split into lines and filter out empty ones
    const lines = contents.toString().split("\n").filter(e => e !== "");
    for (const i in lines) {
      if (lines[i].match(reSeparatorDefinitionLine)) {
        return cb(undefined, lines.splice(i));
      }
    }
    return cb("separator not found", undefined);
  });
}

function parseDateFromWeekday(date) {
  const pieces = date.split(",");
  const dayIndexes = pieces.map(piece => weekdays.findIndex(w => w.includes(piece.toLowerCase())) + 1);
  const weekDates = dayIndexes.map(dayIndex => {
    const weekDate = new Date();
    weekDate.setUTCHours(0,0,0,0);
    weekDate.setDate(weekDate.getDate() + (dayIndex - weekDate.getDay()));
    return weekDate;
  });
  return weekDates;
}

function parseDateFromNumbers(date) {
  if (date.match(reValidDay)) {
    const dateOnlyDay = new Date();
    dateOnlyDay.setDate(date);
    dateOnlyDay.setHours(0);
    dateOnlyDay.setMinutes(0);
    return dateOnlyDay;
  }

  const parsedDate = new Date(date);
  // valid date https://stackoverflow.com/questions/1353684/detecting-an-invalid-date-date-instance-in-javascript
  if (!(parsedDate instanceof Date) || isNaN(parsedDate)) {
    // date in this case would be "Invalid date", should throw something else? or set errno like a real programmer?
    throw date;
  }

  if (date.match(reValidMonthday)) {
    parsedDate.setYear(new Date().getUTCFullYear());
  }

  return parsedDate;
}

function parseValidDates(date) {
  if (date.match(reValidWeekday)) {
    return parseDateFromWeekday(date);
  } else if (date.match(reValidMonthday) || date.match(reValidFulldate) || date.match(reValidDay)) {
    return [ parseDateFromNumbers(date) ];
  } else {
    // return this error?
    console.error(`invalid date format: ${date}`);
  }
  return undefined;
}

function getCurrentEventsFromFile(contents, cb) {
  const separator = contents[0].split(":")[1];
  const lines = contents.splice(1);

  for (const line of lines) {
    if (line.indexOf(separator) < 0) {
      throw `invalid line, missing separator: ${line}`;
    }
    const date = line.split(separator)[0].replace(/^\s+|\s+$/, "");
    const description = line.split(separator)[1].replace(/^\s+|\s+$/, "");
    try {
      const validDates = parseValidDates(date);
      if (!validDates || validDates.length === 0) {
        continue;
      }
      validDates.map(date => currentEvents.push({description, date: date}));
    } catch (err) {
      console.error(`error parsing date '${date}': ${err}`);
    }
  }

  const sortedEvents = currentEvents.sort(e => {
    return e.date;
  });

  return cb(undefined, sortedEvents);
}

function parseArgs() {
  const args = {
    editRemindFile: false,
    printAll: false,
    daysInTheFuture: 7,
  };

  if (argv[2] === "h") {
    args.printHelp = true;
    // this arg prints help and quits
    return args;
  }

  if (argv[2] === "e") {
    args.editRemindFile = true;
    // this arg opens the editor and quits
    return args;
  }

  if (argv[2] === "a") {
    args.printAll = true;
    // print all, ignore other filters
    return args;
  }

  if (argv[2] === "d") {
    const days = Number(argv[3]);
    if (isNaN(days)) {
      args.printHelp = true;
      return args;
    }
    args.daysInTheFuture = days;
  }

  return args;
}

function printFormatDate(date) {
  return date.toLocaleString("en-US", dateOptions);
}

getRemindFile(function(err, filepath) {
  const args = parseArgs();
  if (!args) {
    throw "no args man wth";
  }

  if (args.printHelp) {
    console.log("a to print all, e to edit the remind file, and d for next days");
    return;
  }

  if (args.editRemindFile) {
    const editor = env.EDITOR || "vim";
    const child = spawn(editor, [filepath], {
      stdio: "inherit",
    });
    child.on("exit", function() {
      console.log("remind file updated");
    });
    return;
  }

  if (err) {
    console.log("error reading file");
    return;
  }

  readFileIgnoringAllLinesUntilSeparator(filepath, function(err, contents) {
    if (err) {
      console.log("error reading events from file");
      return;
    }

    getCurrentEventsFromFile(contents, function(err, events) {
      if (err) {
        console.log("error reading events from file");
        return;
      }

      const now = new Date();
      now.setHours(0);
      now.setMinutes(0);
      const upto = new Date();
      upto.setDate(now.getDate()+args.daysInTheFuture);

      console.log("FROM:", printFormatDate(now), "TO:", printFormatDate(upto));
      for (const ev of events) {
        if (!args.printAll && (ev.date < now || upto < ev.date)) {
          continue;
        }
        console.log(`event: ${ev.description} (happens on ${printFormatDate(ev.date)})`);
      }
    });
  });
});
