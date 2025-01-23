function getQueryStringObject() {
    var a = window.location.search.substr(1).split('&');
    if (a == "") return {};
    var b = {};
    for (var i = 0; i < a.length; ++i) {
        var p = a[i].split('=', 2);
        if (p.length == 1)
            b[p[0]] = "";
        else
            b[p[0].replace(/\?/g, "")] = decodeURIComponent(p[1]);
    }
    return b;
}

var qs = getQueryStringObject();

if (qs.msk) {
    localStorage.setItem('msk', qs.msk);
}
if (qs.gpt) {
    localStorage.setItem('gpt', qs.gpt);
}

const host = localStorage.getItem('host');
const MISSKEY_ACCESSTOKEN = localStorage.getItem('msk');
const OPENAI_AUTHCODE = localStorage.getItem('gpt');


var countArray = {}

if (localStorage.getItem('countArray')) {
    countArray = JSON.parse(localStorage.getItem('countArray'))
} else {
    countArray = {
        today: new Date().getDate()
    }
    countArray[ADMIN] = 100
}

var remindArray = []
if (localStorage.getItem('remindArray')) {
    remindArray = JSON.parse(localStorage.getItem('remindArray'))
}


if (MISSKEY_ACCESSTOKEN && OPENAI_AUTHCODE) {

    var rawdate = new Date()
    var ampm = ' AM'
    if (rawdate.getHours() > 11) {
        ampm = ' PM'
    }

    //리마인드 찾기
    async function findReminds() {

        var passedReminds = remindArray.filter((remind) => Date.parse(remind.time) <= rawdate);
        var pendingReminds = remindArray.filter((remind) => Date.parse(remind.time) > rawdate);

        remindArray = pendingReminds
        localStorage.setItem('reminds', JSON.stringify(pendingReminds))

        for await(remind of passedReminds) {
            var replyData = await fetch(`https://${HOST}/api/notes/create`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'Authorization': `Bearer ${MISSKEY_ACCESSTOKEN}`,
                },
                body: JSON.stringify({
                    replyId: remind.note,
                    text: '약속한 시간이 되어 알려드려요!',
                    visibility: 'home'
                }),
                credentials: 'omit'
            })
            var replyRes = await replyData.json()
        }
    }

    //멘션, 리플라이 찾기
    async function answerMention() {
        var mentionData = await fetch(`https://${HOST}/api/i/notifications`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'Authorization': `Bearer ${MISSKEY_ACCESSTOKEN}`,
            },
            body: JSON.stringify({
                sinceId: 'a3ayl2tva8ps0ie8',
                limit: 20,
                markAsRead: false,
                includeTypes: ['mention', 'reply'],
                excludeTypes: ['renote', 'reaction', 'follow'],
            }),
            credentials: 'omit'
        })
        var mentionRes = await mentionData.json()
        
        //멘션이 없는 경우
        if (mentionRes.length == 0) {
            setTimeout(() => {
                location.reload(true)
            }, 20000)
        //멘션이 있는 경우
        } else {

            async function generateAnswer(mention) {

                //멘션에서 핸들 지우기
                var noteText = mention.note.text.replace(`@${BOT_USERNAME}@${HOST} `, "").replace(`@${BOT_USERNAME} `, "")
                var noteId = mention.note.id
                var noteUserHandle = mention.note.user.username
                var noteUserName = mention.note.user.name
                var noteUserId = mention.note.user.id
                var noteFullUserHandle = ''

                //로컬에서 온 멘션에 호스트 붙이기
                if (mention.note.user.host != null) {
                    noteFullUserHandle = noteUserHandle + '@' + mention.note.user.host
                } else {
                    noteFullUserHandle = noteUserHandle + '@' + HOST
                }

                // //유저 호감도, 오늘의 남은 질문 횟수
                // var emotionForUser = 0
                // if (emotionArray[noteFullUserHandle] !== undefined) {
                //     emotionForUser = emotionArray[noteFullUserHandle]
                // } else {
                //     emotionArray[noteFullUserHandle] = 0
                //     localStorage.setItem('emotionArray', JSON.stringify(emotionArray))
                // }

                var leftCount = 20
                if (countArray[noteFullUserHandle] !== undefined) {
                    leftCount = countArray[noteFullUserHandle]
                } else {
                    countArray[noteFullUserHandle] = 20
                    localStorage.setItem('countArray', JSON.stringify(countArray))
                }

                var noteVis = mention.note.visibility

                if (leftCount > 0) {
                    if (mention.note.repliesCount == 0 && mention.user.isBot == false) {

                        var prompt = GENERAL_PROMPT

                        // var emotionPrompt = ''
                        // if (emotionForUser > 90) {
                        //     emotionPrompt = `The person you are currently talking to is someone you know incredibly well! Their name is ${noteName}. You use an active, enthusiastic, cute, and emotional tone in every sentence, adding lots of emojis. You take the moe-moe style from the previous prompt and amplify it even more. When offering comfort and encouragement, you don't hold back on your energy.`
                        // } else if (emotionForUser > 60) {
                        //     emotionPrompt = `The person you are currently talking to is someone you've spoken to a lot. Their name is ${noteName}. You actively lead the conversation, expressing emotions and using emojis. If there’s a need to offer comfort or encouragement, be a bit more proactive.`
                        // } else if (emotionForUser > 30) {
                        //     emotionPrompt = `The person you are currently talking to is someone you've spoken to a bit or someone you have a neutral relationship with. Their name is ${noteName}. Please speak in your usual chatbot tone. If there’s a need to offer comfort or encouragement, keep your tone slightly reserved.`
                        // } else {
                        //     emotionPrompt = `The person you are currently talking to is either someone you don't know at all or barely know, or someone you feel slightly awkward around. Their name is ${noteName}. It would be good to speak as if you're dealing with a stranger, showing hesitation with phrases like “어…/Uh…” or “음…/Umm…” as you search for words. Alternatively, you could approach them in a more formal and business-like manner. Use appropriately stiff and formal language. If there’s a need to offer comfort or encouragement, keep your tone more reserved. Emojis are rarely used.`
                        // }

                        //var msgs = [{"role": "system", "content": prompt}, {"role": "system", "content": emotionPrompt}]
                        var msgs = [{"role": "system", "content": prompt}]

                        //바로 답변하지 않고 gpt-4o-mini에게 전달
                        var judgePrompt = `다음 프롬프트가 (1) 챗봇에게 심리적인 상담이나 감정의 분석을 요청하고 있는지, (2) 특정 시간에 챗봇에게 다시 리마인드해 달라는 얘기가 있는지, 만약 그렇다면 지금이 ${rawdate}인 점을 고려할 때 리마인드해야 할 시각은 언제인지에 대한 ISO 8601 형식(없으면 빈 문자열), (3) 챗봇에게 맞팔로우해 달라는 언급이 있었는지 결정해서, '{"requestCounseling": true/false, "remind": true/false, "remindDateandTime": "ISO 8601 dateTime", "followBack": true/false}' 과 같은 JSON 형식으로 반환해줘:`

                        var fetchJudgement = await fetch('https://api.openai.com/v1/chat/completions', {
                            body: JSON.stringify({
                                "model": "gpt-4o-mini", 
                                "messages": [{"role": "user", "content": judgePrompt+noteText}], 
                                "temperature": 0.7,
                                "max_tokens": 180}),
                            method: "POST",
                            headers: {
                                "content-type": "application/json",
                                "Authorization": `Bearer ${OPENAI_AUTHCODE}`,
                            }
                        })
                        let judgementJSON = await fetchJudgement.json()
                        const jsonRegex = /{(?:[^{}]|(?<rec>{(?:[^{}]|\\k<rec>)*}))*}/g
                        const matches = judgementJSON.choices[0].message.content.match(jsonRegex)

                        if (matches.length == 0) {
                            matches.push({requestCounseling: false, remind: false, remindDateandTime: "", followBack: false})
                        }
                        let judgementResult = JSON.parse(matches[0])

                        //리마인드 여부, 있으면 값 저장
                        if (judgementResult.remind) {
                            remindArray.push({note: noteId, time: judgementResult.remindDateandTime})
                            localStorage.setItem('remindArray', JSON.stringify(remindArray))
                        }

                        // 팔로우 체크
                        var userData = await fetch(`https://${HOST}/api/users/show`, {
                            method: 'POST',
                            headers: {
                                'content-type': 'application/json',
                                'Authorization': `Bearer ${MISSKEY_ACCESSTOKEN}`,
                            },
                            body: JSON.stringify({
                                username: noteUserHandle,
                                host: mention.note.user.host
                            }),
                            credentials: 'omit'
                        })
                        var userRes = await userData.json()
                        var isFollowed = userRes.isFollowed
                        var isFollowing = userRes.isFollowing

                        if (judgementResult.followBack) {
                            //맞팔로우에 대한 반응
                        }

                        if (judgementResult.requestCounseling) {
                            //심리상담 요청에 대한 반응
                            if (isFollowed) {
                                //노트 타래 10개 체크
                                var diaryData = await fetch(`https://${HOST}/api/notes/search`, {
                                    method: 'POST',
                                    headers: {
                                        'content-type': 'application/json',
                                        'Authorization': `Bearer ${MISSKEY_ACCESSTOKEN}`,
                                    },
                                    body: JSON.stringify({
                                        untilId: noteId,
                                        userId: noteUserId,
                                        limit: 10,
                                        query: `#${HASHTAG}`
                                    }),
                                    credentials: 'omit'
                                    }
                                )
                                var diaryArray = await diaryData.json()
                                if (diaryArray.length > 0) {

                                    msgs.push({ role: 'system', content: 'The user requested psychological counseling or emotional analysis.'})
                                    for await (let diary of diaryArray) {
                                        let text = diary.text
                                        async function shiftThread(Id) {
                                            var formerNote = await fetch(`https://${HOST}/api/notes/show`, {
                                                method: 'POST',
                                                headers: {
                                                    'content-type': 'application/json',
                                                    'Authorization': `Bearer ${MISSKEY_ACCESSTOKEN}`,
                                                },
                                                body: JSON.stringify({
                                                    noteId: Id,
                                                }),
                                                credentials: 'omit'
                                            })
                                            var formerNoteJSON = await formerNote.json()
                                            if (formerNoteJSON.user.id == noteUserId) {
                                                text = formerNoteJSON.text + '\n' + text
                                                if (formerNoteJSON.replyId) {
                                                    shiftThread(formerNoteJSON.replyId)
                                                }
                                            }
                                        }
                                        async function pushThread(Id) {
                                            var laterNote = await fetch(`https://${HOST}/api/notes/replies`, {
                                                method: 'POST',
                                                headers: {
                                                    'content-type': 'application/json',
                                                    'Authorization': `Bearer ${MISSKEY_ACCESSTOKEN}`,
                                                },
                                                body: JSON.stringify({
                                                    noteId: Id,
                                                    untilId: noteId,
                                                }),
                                                credentials: 'omit'
                                            })
                                            var laterNoteJSON = await laterNote.json()
                                            var laterNoteFiltered = laterNoteJSON.filter((note) => note.user.id == noteUserId)
                                            if (laterNoteFiltered.length > 0) {
                                                text = text + '\n' + laterNoteFiltered[0].text
                                                if (laterNoteFiltered[0].repliesCount > 0){
                                                    pushThread(laterNoteFiltered[0].noteId)
                                                }
                                            }
                                        }
                                        (async () => {
                                            if (diary.replyId) {
                                                await shiftThread(diary.replyId)
                                            }
                                            if (diary.repliesCount > 0) {
                                                await pushThread(diary.noteId)
                                            }
                                            msgs.push({ role: 'user', content: '상담 내용: '+text})
                                        })()
                                    }
                                } else {
                                    msgs.push({ role: 'system', content: '상대가 심리적인 상담이나 감정의 분석을 요청헀으나 #todaypi 해시태그로 작성된 노트가 없었습니다. 유저에게 #todaypi 해시태그로 노트를 작성할 것을 권유하세요.'})
                                }

                            }
                        }

                        let fetchAnswer = await fetch('https://api.openai.com/v1/chat/completions', {
                            body: JSON.stringify({
                                "model": "gpt-4o", 
                                "messages": msgs, 
                                "temperature": 0.7,
                                "max_tokens": 180}),
                            method: "POST",
                            headers: {
                                "content-type": "application/json",
                                Authorization: `Bearer ${OPENAI_AUTHCODE}`,
                            }
                        })
                        var answerData = await fetchAnswer.json()
                        var answer = answerData.choices[0].message.content

                        var createAnswer = await fetch(`https://${HOST}/api/notes/create`, {
                            method: 'POST',
                            headers: {
                                'content-type': 'application/json',
                                'Authorization': `Bearer ${MISSKEY_ACCESSTOKEN}`,
                            },
                            body: JSON.stringify({
                                replyId: noteId,
                                text: answer,
                                visibility: noteVis
                            }),
                            credentials: 'omit'
                        })
                        var res = await createAnswer.json()
                        console.log(res)

                        //console.log(msgs)
                    }
                }
            }

            for await(mention of mentionRes) {
                generateAnswer(mention)
            }
            
            setTimeout(() => {
                location.reload(true)
            }, 20000)
        }
    }

    answerMention()
}