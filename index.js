// @ts-check

/** @typedef {Record<Number, {group: Number}>} Users */

import { Telegraf, Markup } from 'telegraf'
import dotenv from 'dotenv'
import { fetchTable, shutdownHoursForGroup } from "./api.js"
import * as fs from "fs"
import { keyboard } from 'telegraf/markup'

const KYIV_HOUR_ZONE = +3

/** @type {Users} */
let users = {}
loadUsers()


dotenv.config()
// @ts-ignore
const bot = new Telegraf(process.env.BOT_TOKEN)


let waitingForInput = false;


bot.command("start", (ctx) => {
    ctx.reply("Sup mate, please choose the group for me to follow", createGroupSelectButtons())
    waitingForInput = true
})

bot.command("changegroup", ctx => {
    ctx.reply("Please choose the group for me to follow", createGroupSelectButtons())
    waitingForInput = true
})

bot.command("info", async (ctx) => {
    let group = users[ctx.from.id].group

    if (group === undefined) {
        return ctx.reply("Please select the group using /changeGroup command", keyboard(["/changeGroup"]).oneTime());
    }

    let groupInfo = shutdownHoursForGroup(await fetchTable(), group)
    let message = `Shutdown hours for group ${group}:\n`
    for (let hours of groupInfo) {
        message += `💡${hours[0]}:00-` + (hours[1] ? `${hours[1]}:00` : "") + "\n"
    }

    ctx.reply(message)
}) 

bot.on("message", async (ctx) => {
    if (!ctx.text?.match(/^\d+$/))
        return

    let group = + ctx.text;

    if (group > 18) {
        ctx.reply("Such group does not exist")
        return
    }

    if (waitingForInput) {
        waitingForInput = false
        saveGroup(ctx.message.from.id, group)
        
        ctx.reply("Great! I will follow this group and keep you updated!")
        return
    }

    let groupInfo = shutdownHoursForGroup(await fetchTable(), group)
    let message = `Shutdown hours for group ${group}:\n`
    for (let hours of groupInfo) {
        message += `💡${hours[0]}:00-` + (hours[1] ? `${hours[1]}:00` : "") + "\n"
    }

    ctx.reply(message)
}) 


let warningTimer;
let daylyMessageTimer;

// hours * min * sec * millis
const ONE_DAY = 24 * 60 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000

const DAYLY_MESSAGE_START = 23 * 60 * 60 * 1000 // 23:00:00.000
const WARNING_MESSAGE_START = 35 * 60 * 1000 // 00:35:00.000

setTimeout(() => {
    sendDailyMessages()
    daylyMessageTimer = setInterval(() => {
        sendDailyMessages()
    }, ONE_DAY)
}, ONE_DAY - (Date.now() + KYIV_HOUR_ZONE * 60 * 60 * 1000 - DAYLY_MESSAGE_START) % ONE_DAY)

setTimeout(async () => {
    sendWarningMessages()
    warningTimer = setInterval( async () => {
        sendWarningMessages()
    }, ONE_HOUR)
}, ONE_HOUR - (Date.now() + KYIV_HOUR_ZONE * 60 * 60 * 1000 - WARNING_MESSAGE_START) % ONE_HOUR)

bot.launch();

function createGroupSelectButtons() {
    return Markup.keyboard([
        ["1", "2", "3"], 
        ["4", "5", "6"], 
        ["7", "8", "9"], 
        ["10", "11", "12"], 
        ["13", "14", "15"], 
        ["16", "17", "18"]
    ]).oneTime()
}

async function sendDailyMessages() {
    let tomorrowTable = await fetchTable({next: true})
    for (let [userId, userGroup] of Object.entries(users)) {
        let message = `Shutdown hours for group ${userGroup.group} for tomorrow:\n`
        for (let hours of shutdownHoursForGroup(tomorrowTable, userGroup.group)) {
            message += `${hours[0]}:00-`+ (hours[1] === undefined ? `` : `${hours[1]}:00`) + '\n'
        }
        bot.telegram.sendMessage(userId, message, {disable_notification:true})
    }
}

async function sendWarningMessages() {
    const current_hour = new Date().getUTCHours() + KYIV_HOUR_ZONE
    /** @type {import('./api.js').Table | undefined} */
    let nextDay = undefined;
    if (current_hour === 23) {
        nextDay = await fetchTable({next:true})
    }

    for (let [userId, userGroup] of Object.entries(users)) {

        let message = `The power in your area will shut down in 25 minutes.`


        for (let hours of shutdownHoursForGroup(await fetchTable(), userGroup.group)) {
            // @ts-ignore
            if ((hours[0] - 1) !== current_hour) {
                continue
            }

            if (hours[1] === undefined) {
                // fething nextDay
                if (nextDay === undefined) 
                    nextDay = await fetchTable({next: true})
                
                let nextHours = shutdownHoursForGroup(nextDay, userGroup.group)
                if (nextHours[0][0] === 0) {
                    message += `\nExpecting to turn on at ${nextHours[0][1]}:00`
                } else {
                    message += `\nExpecting to turn on at 00:00`
                }
            } else {
                message += `\nExpecting to turn on at ${hours[1]}:00`
            }

            bot.telegram.sendMessage(userId, message, { disable_notification: (current_hour > 22 || current_hour < 7) })
            return;
        }
    } 
}


/**
 * 
 * @param {Number} userId 
 * @param {Number | null} group  
 */
function saveGroup(userId, group) {
    if (group === null) {
        delete users[userId];
    } else {
        users[userId] = { group };
    }
    saveUsers();
}


function saveUsers() {
    fs.writeFile("./users.json", JSON.stringify(users), () => {})
}

function loadUsers() {
    users = JSON.parse(fs.readFileSync("./users.json").toString())
}

