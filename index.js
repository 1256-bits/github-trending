#!/usr/bin/env node
'use strict'
// Process help flag
if (process.argv.includes("-h") || process.argv.includes("--help")) {
  printHelp("cli")
  process.exit()
}

// Module imports
const colors = require('colors/safe')
const sqlite = require("sqlite3")
const db = new sqlite.Database("db.sqlite")
const readline = require('node:readline').createInterface({
  input: process.stdin,
  output: process.stdout
})

// Constants and global variables
const TIME_MIN = getIntervalTime(process.argv)
const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v")
let offline = process.argv.includes("--offline") || process.argv.includes("-f")
let interval

// Misc initialization
readline.setPrompt("> ")
db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'repos'", createTable)
printHelp()
main()

async function main () {
  if (!offline) {
    console.log("Fetching data from Github")
    try {
      await mainLoop()
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
  readline.on("SIGINT", () => {
    db.close()
    process.exit()
  })
}

async function getTrendingRepos () {
  const response = await fetch("https://api.github.com/search/repositories?q=stars:>=100000&sort=stars&order=desc")
  const json = await response.json()
  const results = json.items.map(item => {
    return { id: item.id, name: item.name, owner: item.owner.login, language: item.language, stars: item.stargazers_count }
  })
  if (VERBOSE) console.log("Fetch complete")
  return results
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
      const value = column === "id" ? parseInt(chunks[1]) : chunks[1]
      return new Promise(resolve => {
        db.get(`SELECT * FROM repos WHERE ${column} = ?`, value, (err, result) => {
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
      readline.removeAllListeners()
      main()
      break
    default:
      console.log("Unknown command")
  }
}

function prettyPrint (record) {
  console.log(colors.bold(`${record.name} by ${record.owner}\n`) + `ID: ${colors.green(record.id)}\n${colors.yellow(record.stars)} stars`)
  if (record.language != null) console.log(`Language: ${record.language}`)
  console.log()
}

function createTable (_, row) {
  if (row != null) return
  db.get("CREATE TABLE repos (id int UNIQUE, name varchar(255), owner varchar(255), language varchar(255), stars int)",
    (err) => {
      if (err) console.log(`Failed to create table with error ${err})`)
    })
  if (VERBOSE) console.log("Table created")
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

async function mainLoop () {
  try {
    const data = await getTrendingRepos()
    const template = data.flatMap(() => '(?, ?, ?, ?, ?)').join(',')
    const dataProcessed = data.flatMap(item => Object.values(item))
    db.run(`INSERT INTO repos (id, name, owner, language, stars) VALUES ${template} ON CONFLICT DO UPDATE SET stars = excluded.stars`, dataProcessed)
    db.get("SELECT COUNT(*) AS 'length' FROM repos", pruneDatabase)
  } catch {
    console.error("Fetch failed. Entering offline mode")
    offline = true
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
