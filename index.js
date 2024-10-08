// @ts-check

/** @typedef {"en" | "uk"} Language*/
/** @typedef {Record<Number, {group?: Number, language?: Language}>} Users */

import { Telegraf, Markup } from 'telegraf'
import dotenv from 'dotenv'
import { fetchTable, shutdownHoursForGroup, tableDiff, tablesEquals } from "./api.js"
import * as fs from "fs"
import { keyboard } from 'telegraf/markup'

import LOCALIZATION from "./localization.json" with {type: "json"}

const KYIV_HOUR_ZONE = +3

/** @type {import('./api.js').Table} */
let previousTable;
(async () => previousTable = await fetchTable())()

/** @type {Users} */
let users = {}
loadUsers()


dotenv.config()
// @ts-ignore
const bot = new Telegraf(process.env.BOT_TOKEN)


/** @type {number[]} */
let waitingForInput = [];


bot.command("start", (ctx) => {
    let language = ctx.from.language_code
    if (language === "uk") {
        saveLanguage(ctx.from.id, "uk")
    } else {
        saveLanguage(ctx.from.id, "en")
    }

    ctx.reply(`${LOCALIZATION[users[ctx.from.id].language ?? "en"].welcome}`, createGroupSelectButtons())
    waitingForInput.push(ctx.from.id)

})

bot.command(["changegroup", "changeGroup"], ctx => {
    waitingForInput.push(ctx.from.id)
    ctx.reply(`${LOCALIZATION[users[ctx.from.id].language ?? "en"].changegroup}`, createGroupSelectButtons())
})

bot.command("info", async (ctx) => {
    let group = users[ctx.from.id].group

    if (group === undefined) {
        return ctx.reply(`${LOCALIZATION[users[ctx.from.id].language ?? "en"].nogroupselected}`, keyboard(["/changeGroup"]).oneTime());
    }

    let groupInfo = shutdownHoursForGroup(await fetchTable(), group)
    let message = `${LOCALIZATION[users[ctx.from.id].language ?? "en"].infomessage} ${group}:\n`
    for (let hours of groupInfo) {
        message += `💡${hours[0]}:00-` + (hours[1] ? `${hours[1]}:00` : "") + "\n"
    }

    ctx.reply(message)
}) 

bot.command(["changelanguage", "changeLanguage"], ctx => {
    waitingForInput.push(ctx.from.id)
    ctx.sendMessage("Select the language", keyboard([["en", "uk"]]).oneTime())
})

bot.on("message", async (ctx) => {
    if (ctx.text?.match(/(uk)|(en)/)) {
        if (waitingForInput.includes(ctx.from.id)) {
            saveLanguage(ctx.from.id, ctx?.text)

            ctx.reply(`${LOCALIZATION[users[ctx.from.id].language ?? "en"].languagechanged}`)
            waitingForInput = waitingForInput.filter(id => id != ctx.from.id)
        }

        return;
    }


    if (!ctx.text?.match(/^\d+$/))
        return

    let group = +ctx.text;

    if (group > 18) {
        ctx.reply(`${LOCALIZATION[users[ctx.from.id].language ?? "en"].groupdoesnotexist}`)
        return
    }

    if (waitingForInput.includes(ctx.from.id)) {
        waitingForInput = waitingForInput.filter(id => id != ctx.from.id)
        saveGroup(ctx.message.from.id, group)
        
        ctx.reply(`${LOCALIZATION[users[ctx.from.id].language ?? "en"].groupselected}`)
        return
    }

    let groupInfo = shutdownHoursForGroup(await fetchTable(), group)
    let message = `${LOCALIZATION[users[ctx.from.id].language ?? "en"].infomessage} ${group}:\n`
    for (let hours of groupInfo) {
        message += `💡${hours[0]}:00-` + (hours[1] ? `${hours[1]}:00` : "") + "\n"
    }

    ctx.reply(message)
}) 


let warningTimer;
let daylyMessageTimer;
let scheduleChangeTimer;

// hours * min * sec * millis
const ONE_DAY = 24 * 60 * 60 * 1000
const ONE_HOUR = 60 * 60 * 1000

const DAYLY_MESSAGE_START = 23 * 60 * 60 * 1000 // 23:00:00.000
const WARNING_MESSAGE_START = 35 * 60 * 1000 // 00:35:00.000
const SCHEDULE_CHANGE_START = 2 * 60 * 1000 // 00:02:00.000

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


setTimeout(() => {
    sendMessageOnScheduleChange()
    scheduleChangeTimer = setInterval(() => {
        sendMessageOnScheduleChange()
    }, ONE_HOUR / 2)
}, (ONE_HOUR / 2) - (Date.now() + KYIV_HOUR_ZONE *  60 * 60 * 1000 - SCHEDULE_CHANGE_START) % (ONE_HOUR / 2))

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
    for (let [userId, { group, language } ] of Object.entries(users)) {
        if (group === undefined) continue;

        let message;

        const shutDownHours = shutdownHoursForGroup(tomorrowTable, group)
        if (shutDownHours.length === 0) {
            message  = `${LOCALIZATION[language ?? "en"].noshutdowntomorrow}`
        } else {
            message = `${LOCALIZATION[language ?? "en"].infomessage} ${group} ${LOCALIZATION[language ?? "en"].fortomorrow}:\n`
            for (let hours of shutdownHoursForGroup(tomorrowTable, group)) {
                message += `💡${hours[0]}:00-`+ (hours[1] === undefined ? `` : `${hours[1]}:00`) + '\n'
            }
        }

        bot.telegram.sendMessage(userId, message, {disable_notification:true})
    }
}

async function sendWarningMessages() {
    const current_hour = (new Date().getUTCHours() + KYIV_HOUR_ZONE) % 24
    /** @type {import('./api.js').Table | undefined} */
    let nextDay = undefined;
    if (current_hour === 23) {
        nextDay = await fetchTable({next:true})
    }

    for (let [userId, userInfo] of Object.entries(users)) {

        let message = `${LOCALIZATION[userInfo.language ?? "en"].warning}`
        if (userInfo.group === undefined) continue

        for (let hours of shutdownHoursForGroup(await fetchTable(), userInfo.group)) {
            // @ts-ignore
            if ((hours[0] - 1) !== current_hour) {
                continue
            }

            if (hours[1] === undefined) {
                // fething nextDay
                if (nextDay === undefined) 
                    nextDay = await fetchTable({next: true})
                
                let nextHours = shutdownHoursForGroup(nextDay, userInfo.group)
                if (nextHours[0][0] === 0) {
                    message += `\n${LOCALIZATION[userInfo.language ?? "en"].turningon} ${nextHours[0][1]}:00`
                } else {
                    message += `\n${LOCALIZATION[userInfo.language ?? "en"].turningon} 00:00`
                }
            } else {
                message += `\n${LOCALIZATION[userInfo.language ?? "en"].turningon} ${hours[1]}:00`
            }

            bot.telegram.sendMessage(userId, message, { disable_notification: (current_hour > 22 || current_hour < 7) })
            break
        }
    } 
}

async function sendMessageOnScheduleChange() {
    const newTable = await fetchTable({force: true});
    const diff = tableDiff(previousTable, newTable) 
    if (diff.every(d => d === false)) {
        return
    };

    previousTable = newTable;

    const current_hour = (new Date().getUTCHours() + KYIV_HOUR_ZONE) % 24
    if (current_hour === 0) {
        return
    } 

    for (let [userId, userInfo] of Object.entries(users)) {
        if (!userInfo.group) continue;
        if (diff[userInfo.group - 1] === false) continue;

        let message = `${LOCALIZATION[userInfo.language ?? "en"].schedulechange}\n`
        
        for (let hours of shutdownHoursForGroup(newTable, userInfo.group)) {
            message += `💡${hours[0]}:00-` + (hours[1] === undefined ? `` : `${hours[1]}:00`) + '\n'
        }

        bot.telegram.sendMessage(userId, message, { disable_notification: (current_hour > 22 || current_hour < 7) })
    }
}


/**
 * 
 * @param {Number} userId 
 * @param {Number} group  
 */
function saveGroup(userId, group) {
    if (users[userId] !== undefined) {
        users[userId].group = group; 
    } else {
        users[userId] = {group: group}
    }
    saveUsers();
}

function saveLanguage(userId, language) {
    if (users[userId] !== undefined) {
        users[userId].language = language;
    } else {
        users[userId] = { language: language }
    }
    saveUsers()
}


function saveUsers() {
    fs.writeFile("./users.json", JSON.stringify(users), () => {})
}

function loadUsers() {
    users = JSON.parse(fs.readFileSync("./users.json").toString())
}

