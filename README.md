# `flatten-subcollection-snapshots`

> Interpolates nested subcollections of a Firestore collection into a single object, and listens for changes along all
> levels.

This package is useful when you:

- have a set of nested subcollections in Firestore
- would like to read all the data in the nested subcollections of a given document
- need the data from all of a document's \[recursive] subcollections to be returned as a property on that object.

## Basic usage

```typescript
import firebase from 'firebase/app';
import 'firebase/firestore';

import flattenSubcollectionSnapshots from 'flatten-subcollection-snapshots';

// an example data structure. This is what will be returned by
// the function, with the `object[]`s populated with subcollection docs.
type User = {
    name: string;
    id: number;

    projects: {
        title: string;
        data: object;

        contributors: {
            userId: number;
            permissionLevel: number;
        }[];

        views: {
            userId: number;
            time: firebase.firestore.Timestamp
        }[];
    }[];
}

// returns a function to unsubscribe _all_ listeners, including those nested in
// lower levels
const unsubscribe = flattenSubcollectionSnapshots<User>(
    // specifies the nesting properties of the data structure
    [
        {
            collection: 'projects',
            subcollections: [
                {
                    collection: 'contributors',
                },
                {
                    collection: 'views',
                }
            ]
        }
    ],
    
    // will be called whenever the document or its subcollections are updated
    (data) => {
        console.log('New update!', data);
    },
    
    // the parent document to search in. Can also be a collection, in
    // which case the fourth parameter should be set to `true`
    firebase.firestore().collection('users').doc('my-user-id'),
    
    // specifies whether the parent reference is a collection. 
    // `false` is assumed as the default value, so can be omitted.
    false,
);
```

## Parameter reference

### returns - type: `ListenerUnsubscriber`

This is an object which contains an `"unsubscribe"` property, which, when called, will
unbind all listeners so as to prevent memory leaks or prevent unnecessary reads once
the data is no longer needed.


### 1. `rules` (type: `SubcollectionFlattenerRuleset<T>`)

Specifies the nesting properties of the data structure. This should take the form of 
an array of objects, with a `"collection"` property providing the name of the subcollection,
and a `"subcollections"` array providing all the nested subcollections within. 


### 2. `updater` (type: `(data: ExpectedResult<T, typeof rules>) => void`)

Is called on every update to the document, or to any documents nested in subcollections
within. The `data` parameter is either an array of objects, if the fourth argument to
`flattenSubcollectionSnapshots` is `true`, or otherwise just an object. 

Note that the  type of `data` is _not_ simply the original type passed, but rather a version of 
it with all properties made optional (as different requests will load at different times) - you may
need to implement your own checks to see if your data has been fully populated before use.


### 3. `parent` (type: `CollectionReference | DocumentReference`)

The parent object in which to search for documents and unpack subcollections. Can be
either a collection, in which case all objects in the collection are unpacked, or
just a single document, in which case only one document is returned.


### 4. `isCollection` (type: `boolean = false`)

This boolean reflects the type of `parent`, with a value of `true` if `parent` represents
a collection, and `false` otherwise.


#### *5. `level` (type: `number = 1`)*

This argument is used internally to control the recursion depth, and evaluate which
events should be deactivated at any given time. The default value of 1 should work for
99% of use cases.