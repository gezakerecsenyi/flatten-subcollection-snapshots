import firebase   from 'firebase/app';
import 'firebase/firestore';

type ObjectArrKeys<T> = {
    [K in keyof T]: T[K] extends object[] ? K : never;
}[keyof T];

export type DocKeys<T> = Omit<T, ObjectArrKeys<T>>
export type ListedKeys<T, Q extends SubcollectionFlattenerRuleset<T>> = Pick<T, (keyof DocKeys<T>) | Q[number]['collection']>;
export type OptionalNestedData<T, Q extends SubcollectionFlattenerRuleset<T>> =
    DocKeys<T>
    & DeepPartial<Pick<T, Q[number]['collection']>>;

export type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends Array<infer R> ? Array<DeepPartial<R>> : DeepPartial<T[K]>
};
export type SubcollectionFlattenerRuleset<T> = {
    [key in ObjectArrKeys<T>]: {
        collection: key,
        subcollections?: T[key] extends (infer I)[] ? SubcollectionFlattenerRuleset<I> : never
    }
}[ObjectArrKeys<T>][];
export type ExpectedResult<T, Q extends SubcollectionFlattenerRuleset<T>> = Q extends true ? DeepPartial<ListedKeys<T, Q>>[] : OptionalNestedData<T, Q>
export type SnapshottableDataSource<T> = {
    onSnapshot: (listener: (data: T) => void) => (() => void);
}
export interface ListenerUnsubscriber {
    unsubscribe: () => void;
    level: number;
}

export default function flattenSubcollectionSnapshots<T, Q extends boolean = false>(
    rules: SubcollectionFlattenerRuleset<T>,
    updater: (data: ExpectedResult<T, typeof rules>) => void,
    parent: Q extends true ? firebase.firestore.CollectionReference : firebase.firestore.DocumentReference,
    isCollection?: Q,
    level: number = 1,
): ListenerUnsubscriber {
    const listeners: ListenerUnsubscriber[] = [];

    const dataGetter = (parent as SnapshottableDataSource<Q extends true ? firebase.firestore.QuerySnapshot<DocKeys<T>> : firebase.firestore.DocumentSnapshot<DocKeys<T>>>)
        .onSnapshot((data) => {
            listeners
                .filter(e => e.level > level)
                .forEach(unsubscriber => unsubscriber.unsubscribe());

            let output = (
                isCollection ?
                    (data as firebase.firestore.QuerySnapshot<DocKeys<T>>).docs.map(e => e.data()) :
                    (data as firebase.firestore.DocumentSnapshot<DocKeys<T>>).data()
            ) as ExpectedResult<T, typeof rules>;
            updater(output);

            const unsubscribers = (isCollection ?
                (data as firebase.firestore.QuerySnapshot<DocKeys<T>>).docs :
                [data] as firebase.firestore.DocumentSnapshot<DocKeys<T>>[])
                .map((doc, i) => {
                    if (isCollection) {
                        // @ts-ignore
                        output[i] = doc.data() as DeepPartial<ListedKeys<T, typeof rules>>;
                    } else {
                        output = doc.data() as OptionalNestedData<T, typeof rules>;
                    }

                    const nextCollectionParent = (
                        isCollection ?
                            (parent as firebase.firestore.CollectionReference).doc(doc.id) :
                            parent
                    ) as firebase.firestore.DocumentReference;

                    return rules.map(subcollection => (
                        flattenSubcollectionSnapshots<T[(typeof rules)[number]['collection']], true>(
                            subcollection.subcollections || [],
                            newValue => {
                                if (isCollection) {
                                    // @ts-ignore
                                    output[i][subcollection.collection] = newValue;
                                } else {
                                    // @ts-ignore
                                    (
                                        output as OptionalNestedData<T, typeof rules>
                                    )[subcollection.collection] = newValue;
                                }
                                updater(output);
                            },
                            nextCollectionParent.collection(subcollection.collection as string),
                            true,
                            level + 1,
                        )
                    ));
                })
                .flat();

            listeners.push(...unsubscribers);
        });
    listeners.push(
        {
            level,
            unsubscribe: dataGetter,
        },
    );

    return {
        unsubscribe: () => {
            listeners.forEach(listener => listener.unsubscribe());
        },
        level,
    };
}
