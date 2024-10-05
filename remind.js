const fs = require("fs");
const path = require("path");

const { env, argv } = require("process");
const { exec } = require("child_process");

const reSeparatorDefinitionLine = /^separator:.{1,3}$/;
const reValidWeekday = /^[A-Za-z]{2,}$/;
const reValidDay = /^\d{1,2}$/;
const reValidMonthday = /^\d{1,2} \d{1,2}$/;
const reValidFulldate = /^\d{4} \d{1,2} \d{1,2}$/;
const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const dateOptions = {year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'};

const currentEvents = [];
const now = new Date();
const daysInTheFuture = 4;
const upto = new Date();
const printDebug = false;
upto.setDate(now.getDate()+daysInTheFuture);

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
  const weekday = weekdays.filter(d => d.indexOf(date.toLowerCase()) >= 0)[0];
  if (!weekday) {
    throw new `no day found for ${date}`;
  }
  const day = weekdays.indexOf(weekday) + 1;
  const weekDate = new Date();
  weekDate.setHours(0);
  weekDate.setMinutes(0);
  weekDate.setDate(weekDate.getDate() + (day - weekDate.getDay()));
  return weekDate;
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

  if (date.match(reValidMonthday)) {
    parsedDate.setYear(now.getUTCFullYear());
  }

  return parsedDate;
}

function parseValidDate(date) {
  if (date.match(reValidWeekday)) {
    return parseDateFromWeekday(date);
  } else if (date.match(reValidMonthday) || date.match(reValidFulldate) || date.match(reValidDay)) {
    return parseDateFromNumbers(date);
  } else {
    // return this error?
    console.error(`invalid date format: ${date}`);
  }
  return undefined;
}

function getCurrentEventsFromFile(contents, printAll, cb) {
  const separator = contents[0].split(":")[1];
  const lines = contents.splice(1);

  for (const line of lines) {
    if (line.indexOf(separator) < 0) {
      throw `invalid line, missing separator: ${line}`;
    }
    const date = line.split(separator)[0].replace(/^\s+|\s+$/, "");
    const description = line.split(separator)[1].replace(/^\s+|\s+$/, "");
    const validDate = parseValidDate(date);
    if (!validDate || (!printAll && (validDate < now || upto < validDate))) {
      continue;
    }
    currentEvents.push({description, date: validDate});
  }

  const sortedEvents = currentEvents.sort(e => {
    return e.date;
  });

  return cb(undefined, sortedEvents);
}

function parseArgs() {
  if (argv.length < 3) {
    return [];
  }

  const args = {};

  if (argv[2] === "e") {
    args.editRemindFile = true;
  }

  if (argv[2] === "a") {
    args.printAll = true;
  }

  return args;
}

getRemindFile(function(err, filepath) {
  const args = parseArgs();
  if (!args) {
    throw "no args man wth";
  }

  if (args.editRemindFile) {
    console.log(`run this by yourself man: ${env.EDITOR} ${filepath}`);
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

    getCurrentEventsFromFile(contents, args.printAll, function(err, events) {
      if (err) {
        console.log("error reading events from file");
        return;
      }

      console.log("today:", now.toLocaleString());
      for (const ev of events) {
        console.log(`event: ${ev.description} (happens on ${ev.date.toLocaleString("en-US", dateOptions)})`);
      }
    });
  });
});
