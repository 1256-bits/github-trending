'use strict'
// TODO: 
// * Add force refresh
// * Add repl
const TIME_MIN = getIntervalTime(process.argv)

const sqlite = require("sqlite3")
const db = new sqlite.Database("db.sqlite")

db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'repos'", createTable)
main()

async function get_trending_repos () {
  const response = await fetch("https://api.github.com/search/repositories?q=stars:>=100000&sort=stars&order=desc")
  const json = await response.json()
  const results = json.items.map(item => {
    return { id: item.id, name: item.name, owner: item.owner.login, language: item.language, stars: item.stargazers_count }
  })
  return results
}

async function main () {
  await main_loop()
  db.get("SELECT COUNT(*) AS 'length' FROM repos", pruneDatabase)
  setInterval(main_loop, TIME_MIN * 60 * 1000)
}

function createTable (_, row) {
  if (row != null) return
  db.get("CREATE TABLE repos (id int, name varchar(255), owner varchar(255), language varchar(255), stars int)",
    (err) => {
      if (err) console.log(`Failed to create table with error ${err})`)
    })
}

function updateOrInsert (row, item) {
  // Insert new row if it is not in the DB. Update the row if the star count has changed. Otherwise do nothing
  if (row == null) {
    db.get(`INSERT INTO repos VALUES ('${item.id}', '${item.name}', '${item.ownder}', '${item.language}', '${item.stars}')`,
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

async function main_loop () {
  const data = await get_trending_repos()
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
