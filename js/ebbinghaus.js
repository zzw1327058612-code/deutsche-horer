/**
 * 艾宾浩斯遗忘曲线模块
 * 根据遗忘曲线计算复习间隔
 *
 * 艾宾浩斯复习周期：
 * 第1次复习：20分钟后
 * 第2次复习：1小时后
 * 第3次复习：9小时后
 * 第4次复习：1天后
 * 第5次复习：2天后
 * 第6次复习：6天后
 * 第7次复习：31天后
 *
 * 为了实际使用，我们简化为天为单位：
 * 第1次：同一天（学习当天）
 * 第2次：1天后
 * 第3次：2天后
 * 第4次：4天后
 * 第5次：7天后
 * 第6次：15天后
 * 第7次：30天后
 * 完成7次后认为已记住
 */
const Ebbinghaus = (function() {

    // 复习间隔（天数）
    const INTERVALS = [0, 1, 2, 4, 7, 15, 30];

    const STAGE_NAMES = [
        '新学',
        '第1次复习',
        '第2次复习',
        '第3次复习',
        '第4次复习',
        '第5次复习',
        '第6次复习',
        '已掌握',
    ];

    function getIntervals() {
        return INTERVALS;
    }

    function getStageName(stage) {
        return STAGE_NAMES[stage] || '已完成';
    }

    function getTotalStages() {
        return INTERVALS.length;
    }

    /**
     * 计算下次复习时间
     * @param {number} stage - 当前阶段
     * @returns {number} 下次复习的 timestamp
     */
    function getNextReviewTime(stage) {
        if (stage >= INTERVALS.length) {
            return null; // 已完成
        }
        const days = INTERVALS[stage];
        return Date.now() + days * 24 * 60 * 60 * 1000;
    }

    /**
     * 检查是否到了复习时间
     */
    function isDue(item) {
        if (item.reviewStage >= INTERVALS.length) return false;
        return item.nextReviewAt <= Date.now();
    }

    /**
     * 获取所有需要复习的项目
     */
    function getDueItems() {
        const items = Storage.getSavedItems();
        return items.filter(item => isDue(item));
    }

    /**
     * 标记一次复习
     * @param {object} item - 收藏项
     * @param {boolean} correct - 是否答对/记住
     */
    function review(item, correct) {
        if (correct) {
            // 答对，进入下一阶段
            const newStage = item.reviewStage + 1;
            const nextReview = getNextReviewTime(newStage);
            Storage.updateItem(item.id, {
                reviewStage: newStage,
                reviewCount: (item.reviewCount || 0) + 1,
                lastReviewAt: Date.now(),
                nextReviewAt: nextReview || Date.now() + 365 * 24 * 60 * 60 * 1000,
            });
            Storage.addReviewLog(item.id, item.reviewStage, true);
        } else {
            // 答错，重置到第一个阶段
            const nextReview = Date.now() + 20 * 60 * 1000; // 20分钟后
            Storage.updateItem(item.id, {
                reviewStage: 0,
                reviewCount: (item.reviewCount || 0) + 1,
                lastReviewAt: Date.now(),
                nextReviewAt: nextReview,
            });
            Storage.addReviewLog(item.id, item.reviewStage, false);
        }
    }

    /**
     * 获取复习统计
     */
    function getStats() {
        const items = Storage.getSavedItems();
        const dueItems = items.filter(i => isDue(i));
        const mastered = items.filter(i => i.reviewStage >= INTERVALS.length);
        const learning = items.filter(i => i.reviewStage < INTERVALS.length);

        return {
            total: items.length,
            due: dueItems.length,
            mastered: mastered.length,
            learning: learning.length,
        };
    }

    /**
     * 获取今日需复习的项目（包含到期的）
     */
    function getTodayReview() {
        return getDueItems().sort((a, b) => a.nextReviewAt - b.nextReviewAt);
    }

    return {
        getIntervals,
        getStageName,
        getTotalStages,
        getNextReviewTime,
        isDue,
        getDueItems,
        review,
        getStats,
        getTodayReview,
    };
})();
