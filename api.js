// @ts-check

/** @typedef {("в"|"з"|"мз")}  State */
/** @typedef {State[]} Group */
/** @typedef {Group[]} Table */

/** @type {Table | undefined} */
let data = undefined
/** @type {Number} */
let lastFetched = 0

const UTC_OFFSET = 3 * 60 * 60 * 1000

const URL = "https://oblenergo.cv.ua/shutdowns/"
const NEXT = "?next"

const groupsRegex = /(<div id="inf\d+" data-id="\d+">([ \n]*<(s|u|o)>(мз|з|в)<\/(s|u|o)>[ \n]*){24}<\/div>)/gm
const groupRegex = /(<(s|u|o)>(мз|з|в)<\/(s|u|o)>)/gm
const replaceRegex = /(<(s|u|o)>)|(<\/(s|u|o)>)/gm

const TEN_MINUTES = 10 * 60 * 1000

/**
 * @param {{force?: boolean, next?:boolean}} params
 * @returns {Promise<Table>}
 */
function fetchTable(params = {force: false, next:false}) {
    return new Promise((resolve, reject) => {

        if (data !== undefined && lastFetched < Date.now() - TEN_MINUTES && !params.force && !params.next) {
            resolve(data)
        }

        fetch(URL + (params.next ? NEXT : ""))
            .then(data => data.text())
            .then(text => {
                /** @type {Table} */
                let table = []

                const shutdowns = text.match(groupsRegex)

                if (shutdowns === null) {
                    reject("Cannot parse the site. Rewiew the parsing logic")
                    return
                }

                for (let groupInfoStr of shutdowns) {
                    const statesStr = groupInfoStr.match(groupRegex)

                    // @ts-ignore
                    const states = statesStr.map(str => str.replace(replaceRegex, ""))

                    // @ts-ignore
                    table.push(states)
                }

                if (!params.next)
                {
                    data = table
                    lastFetched = Date.now()
                }
                
                resolve(table);
            })
            .catch(error => reject(error))
    })
}

/**
 * 
 * @param {Table} table 
 * @param {Number} group
 */
function shutdownHoursForGroup(table, group) {
    return groupShutdownHours(table[group-1]);
}

/**
 * @param {Group} group 
 * @returns {(number | undefined)[][]}
 */
function groupShutdownHours(group) {
    /** @type { (number | undefined)[][] } */
    const hours = []
    /** @type {number | undefined} */
    let current = undefined;
    group.forEach((state, indx) => {
        if (current === undefined) {
            if (state === "в") {
                current = indx
            }
        } else {
            if (state === "мз" || state === "з") {
                hours.push([current, indx])
                current = undefined
            }
        }
    })

    if (current !== undefined) {
        hours.push([current, undefined])
    }

    return hours
}

/**
 * 
 * @param {Table} table1 
 * @param {Table} table2 
 * 
 * @returns {boolean}
 */
function tablesEquals(table1, table2) {
    for (let i = 0; i < table1.length; i++) {
        for (let j = 0; j < table1[i].length; j++) {
            if (table1[i][j] !== table2[i][j]) return false
        }
    }

    return true
}

function tableDiff(table1, table2) {
    const diff = new Array(table1.length).fill(false)
    for (let i = 0; i < table1.length; i++) {
        for (let j = 0; j < table1[i].length; j++) {
            if (table1[i][j] !== table2[i][j])
                diff[i] = true
        }
    }

    return diff
}


export { fetchTable, groupShutdownHours, shutdownHoursForGroup, tablesEquals, tableDiff }
