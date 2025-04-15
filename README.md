# alt text bot

alt text bot is a bot for Discuit that automagically generates alt text for
images using a large language model.

powered by the [@discuit-community] group of packages.

## setup

to run your own instance:

1. clone this repo
2. install [bun](https://bun.sh/)
3. create a `.altbotrc.json` file with your configuration (see example below)
4. install dependencies with bun install
5. run with `bun start`, or `bun dev` for live reloading

### config

```json
{
  "discuit": {
    "baseUrl": "https://discuit.org",
    "username": "your-username",
    "password": "your-password"
  },
  "ai": {
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKey": "your-api-key",
    "model": "google/gemma-3-4b-it" // make sure to use a model that supports vision
  },
}
```

## copying

this project is licensed under the copyleft GNU Affero General Public License
v3.0. you can find the full text of the license in the [`COPYING`](COPYING)
file.

[@discuit-community]: https://github.com/discuit-community/
