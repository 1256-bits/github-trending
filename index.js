'use strict'
const TIME_MIN = 5

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

function main () {
  main_loop()
  setInterval(main_loop, TIME_MIN * 60 * 1000)
}

function createTable (_, row) {
  if (row != null) return
  db.run("CREATE TABLE repos (id int, name varchar(255), owner varchar(255), language varchar(255), stars int, PRIMARY KEY id")
}

function updateOrInsert (row, item) {
  // Insert new row if it is not in the DB. Update the row if the star count has changed. Otherwise do nothing
  if (row == null) {
    db.run(`INSERT INTO repos VALUES (${row.id}, ${row.name}, ${row.ownder}, ${row.language}, ${row.stars}`)
  }
  else if (row.stars !== item.stars) {
    db.run(`UPDATE repos SET stars = ${item.stars} WHERE id = ${item.id}`)
  }
}

async function main_loop () {
    const data = await get_trending_repos()
    data.each(item => {
      db.get(`SELECT * FROM repos WHERE id = ${item.id}`, (_, row) => updateOrInsert(row, item))
    })
  }
