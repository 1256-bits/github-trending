'use strict'

const sqlite = require("sqlite3")
const db = new sqlite("db.sqlite")

db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'repos'", createTable)

async function get_trending_repos () {
  const response = await fetch("https://api.github.com/search/repositories?q=stars:>=100000&sort=stars&order=desc")
  const json = await response.json()
  const results = json.items.map(item => {
    return { id: item.id, name: item.name, owner: item.owner.login, language: item.language, stars: item.stargazers_count }
  })
  return results
}

function main () {
  setInterval(() => {
    get_trending_repos().then(json => console.log(json))
  }, 1000)
}

function createTable (_, row) {
  if (row != null) return
  db.run("CREATE TABLE repos (id int, name varchar(255), owner varchar(255), language varchar(255), stars int, PRIMARY KEY id")
}
