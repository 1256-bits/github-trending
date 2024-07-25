'use strict'

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
