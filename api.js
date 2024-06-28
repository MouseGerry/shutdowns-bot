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

/**
 * @param {{force?: boolean, next?:boolean}} params
 * @returns {Promise<Table>}
 */
function fetchTable(params = {force: false, next:false}) {
    return new Promise((resolve, reject) => {

        if (data !== undefined && lastFetched > today() && !params.force && !params.next) {
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
                    let states = statesStr.map(str => str.replace(replaceRegex, ""))

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


function today() {
    let now = Date.now()
    return now - (now % (1000 * 60 * 60 * 24)) - UTC_OFFSET
}

function tomorrow() {
    return today() + 1000 * 60 * 60 * 24
}

export { fetchTable, groupShutdownHours, shutdownHoursForGroup, today, tomorrow }
