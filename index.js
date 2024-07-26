#!/bin/node
'use strict'

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  printHelp("cli")
  process.exit()
}

const TIME_MIN = getIntervalTime(process.argv)
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v")
let offline = process.argv.includes("--offline") || process.argv.includes("-f")
let interval

const colors = require('colors/safe')
const sqlite = require("sqlite3")
const db = new sqlite.Database("db.sqlite")
const readline = require('node:readline').createInterface({
  input: process.stdin,
  output: process.stdout
})
readline.setPrompt("> ")

db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'repos'", createTable)
printHelp()
main()

async function getTrendingRepos () {
  const response = await fetch("https://api.github.com/search/repositories?q=stars:>=100000&sort=stars&order=desc")
  const json = await response.json()
  const results = json.items.map(item => {
    return { id: item.id, name: item.name, owner: item.owner.login, language: item.language, stars: item.stargazers_count }
  })
  if (VERBOSE) console.log("Fetch complete")
  return results
}

async function main () {
  if (!offline) {
    console.log("Fetching data from Github")
    try {
      await mainLoop()
      db.get("SELECT COUNT(*) AS 'length' FROM repos", pruneDatabase)
      interval = setInterval(mainLoop, TIME_MIN * 60 * 1000)
    } catch {
      console.error("Fetch failed. Entering offline mode")
      offline = true
    }
  } else {
    console.log("Launching in offline mode")
  }
  readline.prompt()
  readline.on("line", repl)
}

async function repl (answer) {
  await handleResponse(answer)
  readline.prompt()
}

async function handleResponse (resp) {
  const chunks = resp.split(" ")
  switch (chunks[0]) {
    case "?":
    case "help":
      printHelp()
      break
    case "q":
    case "quit":
      db.close()
      readline.close()
      process.exit()
    case "list":
      return new Promise(resolve => {
        db.all("SELECT * FROM repos", (err, result) => {
          if (err) console.log(err)
          result.forEach(item => prettyPrint(item))
          resolve()
        })
      })
    case "get":
      const column = isNaN(parseInt(chunks[1])) ? "name" : "id" // Technically fails if the name is just numbers. Doesn't matter in this case.
      const value = column === "id" ? parseInt(chunks[1]) : `'${chunks[1].replaceAll("'", "")}'`
      return new Promise(resolve => {
        db.get(`SELECT * FROM repos WHERE ${column} = ${value}`, (err, result) => {
          if (err) console.log(err)
          if (result == null) {
            console.log(`${value} not found`)
            resolve()
          } else {
            prettyPrint(result)
            resolve()
          }
        })
      })
    case "refresh":
      if (offline) {
        console.log("Refresh is disabled in offline mode.")
        return
      }
      clearInterval(interval)
      main()
      break
    default:
      console.log("Unknown command")
  }
}

function prettyPrint (record) {
  console.log(colors.bold(`${record.name} by ${record.owner}\n`) + `ID: ${colors.green(record.id)}\n${colors.yellow(record.stars)} stars`)
  if (record.language !== "null") console.log(`Language: ${record.language}`)
  console.log()
}

function createTable (_, row) {
  if (row != null) return
  db.get("CREATE TABLE repos (id int, name varchar(255), owner varchar(255), language varchar(255), stars int)",
    (err) => {
      if (err) console.log(`Failed to create table with error ${err})`)
    })
  if (VERBOSE) console.log("Table created")
}

function updateOrInsert (row, item) {
  // Insert new row if it is not in the DB. Update the row if the star count has changed. Otherwise do nothing
  if (row == null) {
    db.get(`INSERT INTO repos VALUES ('${item.id}', '${item.name}', '${item.owner}', '${item.language}', '${item.stars}')`,
      (err) => {
        if (err) console.log("Failed to insert row ", item, ` with error ${err}`)
      })
  }
  else if (row.stars !== item.stars) {
    db.get(`UPDATE repos SET stars = '${item.stars}' WHERE id = '${item.id}'`,
      (err) => {
        if (err) console.log("Failed to update row ", row, " to ", item, ` with error ${err}`)
      })
  }
}

async function mainLoop () {
  const data = await getTrendingRepos()
  data.forEach(item => {
    // The number of items is fixed at 30, so making a query for each item is probably fine.
    db.get(`SELECT * FROM repos WHERE id = '${item.id}'`, (_, row) => updateOrInsert(row, item))
  })
  db.get("SELECT COUNT(*) AS 'length' FROM repos", pruneDatabase)
}

function pruneDatabase (_, data) {
  if (data == null) return // Exit if the table has no rows
  if (data.length > 30) {
    db.get("DELETE FROM repos WHERE stars < (SELECT * FROM repos ORDER BY stars LIMIT 1 OFFSET 30)",
      (err) => {
        if (err) console.log(`Failed to prune records with error ${err}`)
      })
    if (VERBOSE) console.log("Database pruned")
  }
}

function getIntervalTime (args) {
  const defValue = 5
  if (args.includes("--time")) {
    const index = args.indexOf("--time")
    const value = parseInt(args[index + 1])
    return !isNaN(value) ? args[index + 1] : defValue
  }
  else if (args.includes("-t")) {
    const index = args.indexOf("-t")
    const value = parseInt(args[index + 1])
    return !isNaN(value) ? args[index + 1] : defValue
  }
  return defValue
}

function printHelp (type = "repl") { // type: "repl" | "cli"
  console.log("=== Github trending repos v1 ===")
  const helpOptions = type === "repl" ?
    [
      { command: "get <ID | NAME>", info: "find a repository by id or name" },
      { command: "list", info: "list all repositories" },
      { command: "refresh", info: "force refresh the database" },
      { command: "? help", info: "print this message" },
      { command: "q quit", info: "exit" }
    ] :
    [
      { command: "-t --time", info: "Set time interval to refetch the data" },
      { command: "-v --verbose", info: "Launch with logging" },
      { command: "-h --help", info: "Print this message" },
      { command: "-f --offline", info: "Launch in offline mode. No data is fetched. Refresh is disabled" }
    ]
  const longestMsgLen = helpOptions.map(item => item.command.length).sort((a, b) => a > b ? -1 : 1)[0]
  helpOptions.forEach(item => {
    const commandPretty = item.command.length < longestMsgLen ? item.command.padEnd(longestMsgLen) : item.command
    console.log(`${commandPretty} - ${item.info}`)
  })
  console.log()
}
